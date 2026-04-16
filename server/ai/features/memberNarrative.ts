import { db } from "../../db";
import { profiles, locations, events, tasks, checkins } from "@shared/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { callClaude } from "../aiEngine";

export async function generateMemberNarrative(familyId: string, memberId: string): Promise<string | null> {
  const today = new Date();
  const startOfDay = new Date(today.toISOString().split("T")[0] + "T00:00:00.000Z");
  const tomorrow = new Date(today.getTime() + 86_400_000);

  const [memberRes, locationsToday, eventsNext, tasksRes, checkinsToday] = await Promise.all([
    db.select({ name: profiles.name, role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, memberId))
      .limit(1),

    db.select({ lat: locations.lat, lng: locations.lng, isMoving: locations.isMoving, timestamp: locations.timestamp })
      .from(locations)
      .where(and(eq(locations.userId, memberId), gte(locations.timestamp, startOfDay)))
      .orderBy(desc(locations.timestamp))
      .limit(20),

    db.select({ title: events.title, startAt: events.startAt })
      .from(events)
      .where(and(eq(events.familyId, familyId), gte(events.startAt, today), gte(events.startAt, tomorrow))),

    db.select({ title: tasks.title, completedAt: tasks.completedAt })
      .from(tasks)
      .where(and(eq(tasks.assignedTo, memberId), gte(tasks.createdAt, startOfDay)))
      .limit(5),

    db.select({ placeName: checkins.placeName, note: checkins.note, createdAt: checkins.createdAt })
      .from(checkins)
      .where(and(eq(checkins.userId, memberId), gte(checkins.createdAt, startOfDay)))
      .orderBy(desc(checkins.createdAt))
      .limit(5),
  ]);

  if (!memberRes.length) return null;
  const member = memberRes[0];

  const moveCount = locationsToday.length;
  const wasMoving = locationsToday.some(l => l.isMoving);
  const selfCheckIns = checkinsToday.map(c => c.placeName).join(", ");

  const tomorrowEvents = eventsNext
    .filter(e => new Date(e.startAt) < tomorrow)
    .map(e => e.title)
    .join(", ");

  const completedTasks = tasksRes.filter(t => t.completedAt).map(t => t.title).join(", ");

  const prompt = `
Sei l'assistente di una famiglia italiana. Scrivi una breve narrativa affettuosa e personale su ${member.name} 
in italiano, come se fossi un familiare che racconta la giornata con calore e affetto.
Tono: caldo, narrativo, umano. NON usare elenchi. Massimo 3-4 frasi.
Inizia sempre con il nome della persona. Usa un linguaggio naturale, non robotico.
Se ci sono eventi domani importanti (interrogazione, visita), ricordali con delicatezza.

Dati giornata di ${member.name} (ruolo: ${member.role}):
- Rilevamenti posizione oggi: ${moveCount}
- Era in movimento: ${wasMoving ? "sì" : "no (probabilmente a casa o scuola)"}
- Check-in autonomi: ${selfCheckIns || "nessuno"}
- Compiti completati: ${completedTasks || "nessuno"}
- Eventi importanti domani: ${tomorrowEvents || "nessuno"}

Scrivi la narrativa:`.trim();

  return await callClaude(prompt, 250);
}
