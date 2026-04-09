import { db } from "../../db";
import { subscriptions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { callClaude, parseJSON, getCached, saveCache } from "../aiEngine";
import { generateSpendingForecast } from "./spendingForecast";
import { detectAnomalies } from "./anomalyDetector";

interface HealthScoreItem {
  label: string;
  status: "ok" | "warning" | "error";
}

export interface HealthScore {
  score: number;
  items: HealthScoreItem[];
  summary: string;
}

export async function calculateHealthScore(familyId: string): Promise<HealthScore | null> {
  const cached = await getCached<HealthScore>(familyId, "health_score", 24);
  if (cached) return cached;

  const [forecast, anomalies, subs] = await Promise.all([
    generateSpendingForecast(familyId),
    detectAnomalies(familyId),
    db.select({ amount: subscriptions.amount, billingCycle: subscriptions.billingCycle })
      .from(subscriptions)
      .where(eq(subscriptions.familyId, familyId)),
  ]);

  const totalSubscriptions = subs
    .reduce((s, sub) => {
      const amount = Number(sub.amount);
      const monthly = sub.billingCycle === "yearly" ? amount / 12 : amount;
      return s + monthly;
    }, 0)
    .toFixed(2);

  const prompt = `
Calcola uno score di salute finanziaria da 0 a 100 per questa famiglia.
100 = perfetto, 0 = situazione critica. Sii oggettivo e basato sui dati.
Rispondi SOLO in JSON valido, senza testo aggiuntivo né markdown.

Previsione spese mese: ${JSON.stringify(forecast)}
Anomalie rilevate: ${anomalies.length}
Totale abbonamenti mensili: ${totalSubscriptions}€

Esempio di risposta corretta:
{"score":72,"items":[{"label":"Spese mensili nella norma","status":"ok"},{"label":"Una anomalia su Trasporti (+65%)","status":"warning"},{"label":"Abbonamenti sotto controllo","status":"ok"}],"summary":"Situazione finanziaria buona, attenzione alla voce trasporti che è cresciuta nell'ultimo mese."}

Rispondi con lo stesso formato JSON:
  `.trim();

  const raw = await callClaude(prompt, 400);
  const result = parseJSON<HealthScore>(raw);
  if (!result) return null;

  await saveCache(familyId, "health_score", result);
  return result;
}
