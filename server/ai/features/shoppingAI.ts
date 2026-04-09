import { db } from "../../db";
import { shoppingItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { callClaude, parseJSON } from "../aiEngine";

interface ShoppingSuggestion {
  name: string;
  reason: string;
  confidence: number;
}

export async function suggestShoppingItems(familyId: string): Promise<ShoppingSuggestion[]> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);

  const [history, current] = await Promise.all([
    db.select({ name: shoppingItems.name, createdAt: shoppingItems.createdAt })
      .from(shoppingItems)
      .where(and(eq(shoppingItems.familyId, familyId), eq(shoppingItems.checked, true))),
    db.select({ name: shoppingItems.name })
      .from(shoppingItems)
      .where(and(eq(shoppingItems.familyId, familyId), eq(shoppingItems.checked, false))),
  ]);

  const recentHistory = history
    .filter(h => new Date(h.createdAt) >= sixtyDaysAgo)
    .slice(0, 100);

  if (recentHistory.length < 5) return [];

  const currentItems = current.map(i => i.name.toLowerCase());

  const prompt = `
Analizza gli acquisti passati e suggerisci al massimo 5 articoli da aggiungere alla lista della spesa.
Suggerisci solo articoli NON già presenti nella lista. Basa i suggerimenti sulla frequenza di acquisto.
Rispondi SOLO in JSON valido, senza testo aggiuntivo né markdown.

Storico acquisti (ultimi 60 giorni): ${JSON.stringify(recentHistory)}
Articoli già in lista: ${JSON.stringify(currentItems)}
Data oggi: ${new Date().toISOString().split("T")[0]}

Esempio di risposta corretta:
{"suggestions":[{"name":"Latte","reason":"Lo compri ogni 4-5 giorni, l'ultimo acquisto risale a 6 giorni fa","confidence":0.92},{"name":"Pane","reason":"Acquisto settimanale abituale","confidence":0.85}]}

Rispondi con lo stesso formato JSON:
  `.trim();

  const raw = await callClaude(prompt, 400);
  const result = parseJSON<{ suggestions: ShoppingSuggestion[] }>(raw);
  return result?.suggestions?.filter(s => s.confidence > 0.6).slice(0, 5) ?? [];
}
