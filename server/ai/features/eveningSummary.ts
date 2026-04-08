import { db } from "../../db";
import { profiles, locations, expenses, events } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { callClaude, saveCache, saveInsight } from "../aiEngine";

export async function generateEveningSummary(familyId: string): Promise<string | null> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const startOfDay = new Date(todayStr + "T00:00:00.000Z");
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [membersRes, locationsRes, expensesRes, eventsRes] = await Promise.all([
    db.select({ name: profiles.name, role: profiles.role })
      .from(profiles)
      .where(eq(profiles.familyId, familyId)),

    db.select({ userId: locations.userId, lat: locations.lat, lng: locations.lng, timestamp: locations.timestamp })
      .from(locations)
      .where(and(eq(locations.familyId, familyId), gte(locations.timestamp, startOfDay))),

    db.select({ amount: expenses.amount, title: expenses.title, notes: expenses.notes })
      .from(expenses)
      .where(and(eq(expenses.familyId, familyId), gte(expenses.date, startOfDay))),

    db.select({ title: events.title, startAt: events.startAt, assignedTo: events.assignedTo })
      .from(events)
      .where(and(
        eq(events.familyId, familyId),
        gte(events.startAt, today),
        lte(events.startAt, tomorrow),
      )),
  ]);

  const totalSpent = expensesRes.reduce((s, e) => s + Math.abs(Number(e.amount)), 0).toFixed(2);

  const prompt = `
Sei l'assistente della famiglia. Scrivi un riepilogo serale in italiano,
tono caldo e familiare, massimo 4 frasi.
NON usare elenchi puntati. Scrivi come un messaggio di testo.
Menziona solo le cose interessanti o rilevanti.
Se domani ci sono eventi importanti (interrogazioni, visite mediche) ricordali con gentilezza.

Membri famiglia: ${JSON.stringify(membersRes)}
Movimenti oggi: ${locationsRes.length} rilevamenti
Spese oggi: ${totalSpent}€ in ${expensesRes.length} transazioni
Titoli spese: ${expensesRes.map(e => e.title).join(", ") || "nessuna"}
Eventi domani: ${JSON.stringify(eventsRes)}
  `.trim();

  const summary = await callClaude(prompt, 300);
  if (!summary) return null;

  await saveCache(familyId, "evening_summary", { text: summary, date: todayStr });
  await saveInsight(familyId, "evening_summary", summary, "info");

  return summary;
}
