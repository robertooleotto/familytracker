import { db } from "../../db";
import { expenses, budgetCategories } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { callClaude, parseJSON, getCached, saveCache } from "../aiEngine";

interface SpendingForecast {
  forecast_total: number;
  forecast_by_category: Record<string, number>;
  trend: "above_average" | "below_average" | "on_track";
  advice: string;
  confidence: number;
}

export async function generateSpendingForecast(familyId: string): Promise<SpendingForecast | null> {
  const cached = await getCached<SpendingForecast>(familyId, "spending_forecast", 24);
  if (cached) return cached;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [txs, cats] = await Promise.all([
    db.select({ date: expenses.date, amount: expenses.amount, categoryId: expenses.categoryId })
      .from(expenses)
      .where(and(eq(expenses.familyId, familyId), gte(expenses.date, sixMonthsAgo)))
      .orderBy(expenses.date),
    db.select({ id: budgetCategories.id, name: budgetCategories.name })
      .from(budgetCategories)
      .where(eq(budgetCategories.familyId, familyId)),
  ]);

  if (txs.length < 3) return null;

  const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));

  const byMonth: Record<string, { total: number; by_category: Record<string, number> }> = {};
  for (const tx of txs) {
    const month = new Date(tx.date).toISOString().substring(0, 7);
    if (!byMonth[month]) byMonth[month] = { total: 0, by_category: {} };
    const amt = Math.abs(Number(tx.amount));
    byMonth[month].total += amt;
    const catName = tx.categoryId ? (catMap[tx.categoryId] ?? "Altro") : "Altro";
    byMonth[month].by_category[catName] = (byMonth[month].by_category[catName] ?? 0) + amt;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthSpending = txs
    .filter(tx => new Date(tx.date) >= startOfMonth)
    .reduce((s, tx) => s + Math.abs(Number(tx.amount)), 0)
    .toFixed(2);

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const prompt = `
Sei un analista finanziario familiare. Analizza questi dati e prevedi la spesa totale di questo mese.
Rispondi SOLO in JSON valido, senza testo aggiuntivo né markdown.

Spese per mese (ultimi 6 mesi): ${JSON.stringify(byMonth)}
Spese questo mese finora: ${currentMonthSpending}€
Giorno corrente: ${dayOfMonth} di ${daysInMonth}

Esempio di risposta corretta:
{"forecast_total":1850.00,"forecast_by_category":{"Alimentari":650,"Trasporti":280,"Utenze":320,"Svago":200,"Altro":400},"trend":"above_average","advice":"Le spese alimentari sono cresciute del 15% rispetto alla media, potresti pianificare i pasti settimanali.","confidence":0.82}

Rispondi con lo stesso formato JSON:
  `.trim();

  const raw = await callClaude(prompt, 400);
  const result = parseJSON<SpendingForecast>(raw);
  if (!result) return null;

  await saveCache(familyId, "spending_forecast", result);
  return result;
}
