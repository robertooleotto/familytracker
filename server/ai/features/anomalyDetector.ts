import { db } from "../../db";
import { expenses, budgetCategories } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { callClaude, parseJSON, saveInsight } from "../aiEngine";

interface Anomaly {
  category: string;
  average_monthly: number;
  current_month: number;
  percentage_increase: number;
  message: string;
}

export async function detectAnomalies(familyId: string): Promise<Anomaly[]> {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [historical, current, cats] = await Promise.all([
    db.select({ amount: expenses.amount, categoryId: expenses.categoryId, date: expenses.date })
      .from(expenses)
      .where(and(eq(expenses.familyId, familyId), gte(expenses.date, threeMonthsAgo))),
    db.select({ amount: expenses.amount, categoryId: expenses.categoryId })
      .from(expenses)
      .where(and(eq(expenses.familyId, familyId), gte(expenses.date, startOfMonth))),
    db.select({ id: budgetCategories.id, name: budgetCategories.name })
      .from(budgetCategories)
      .where(eq(budgetCategories.familyId, familyId)),
  ]);

  const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));
  const getCat = (id: string | null) => id ? (catMap[id] ?? "Altro") : "Altro";

  // Compute monthly averages
  const byMonthCat: Record<string, Record<string, number>> = {};
  for (const tx of historical) {
    const month = new Date(tx.date).toISOString().substring(0, 7);
    const cat = getCat(tx.categoryId);
    if (!byMonthCat[month]) byMonthCat[month] = {};
    byMonthCat[month][cat] = (byMonthCat[month][cat] ?? 0) + Math.abs(tx.amount);
  }

  const months = Object.keys(byMonthCat);
  const avgByCategory: Record<string, number> = {};
  const allCats = new Set(months.flatMap(m => Object.keys(byMonthCat[m])));
  for (const cat of allCats) {
    const vals = months.map(m => byMonthCat[m][cat] ?? 0);
    avgByCategory[cat] = vals.reduce((s, v) => s + v, 0) / Math.max(months.length, 1);
  }

  const currByCategory: Record<string, number> = {};
  for (const tx of current) {
    const cat = getCat(tx.categoryId);
    currByCategory[cat] = (currByCategory[cat] ?? 0) + Math.abs(tx.amount);
  }

  const candidates = Object.keys(currByCategory).filter(cat => {
    const avg = avgByCategory[cat] ?? 0;
    const curr = currByCategory[cat];
    return avg > 10 && curr / avg > 1.5;
  });

  if (candidates.length === 0) return [];

  const prompt = `
Analizza queste anomalie di spesa familiare.
Genera un messaggio in italiano per ciascuna, tono neutro e informativo (non allarmistico).
Rispondi SOLO in JSON array, nessun testo aggiuntivo.

Medie mensili: ${JSON.stringify(avgByCategory)}
Mese corrente: ${JSON.stringify(currByCategory)}
Categorie anomale: ${candidates.join(", ")}

JSON richiesto:
[
  {
    "category": "nome categoria",
    "average_monthly": 0,
    "current_month": 0,
    "percentage_increase": 0,
    "message": "messaggio in italiano max 1 frase"
  }
]
  `.trim();

  const raw = await callClaude(prompt, 500);
  const anomalies = parseJSON<Anomaly[]>(raw);
  if (!anomalies || !Array.isArray(anomalies)) return [];

  for (const anomaly of anomalies) {
    await saveInsight(
      familyId,
      "spending_anomaly",
      anomaly.message,
      anomaly.percentage_increase > 100 ? "warning" : "info",
    );
  }

  return anomalies;
}
