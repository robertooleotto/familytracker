import { db } from "../../db";
import { events } from "@shared/schema";
import { eq, and, gte, lte, ilike } from "drizzle-orm";
import { callClaude, parseJSON } from "../aiEngine";

interface StudySession {
  date: string;
  time: string;
  duration_minutes: number;
  subject: string;
  reason: string;
}

interface StudyPlan {
  study_sessions: StudySession[];
  tip: string;
}

export async function generateStudyPlan(familyId: string, childId: string): Promise<StudyPlan | null> {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 86_400_000);

  const [tests, activities] = await Promise.all([
    db.select({ title: events.title, startAt: events.startAt, notes: events.description })
      .from(events)
      .where(and(
        eq(events.familyId, familyId),
        gte(events.startAt, now),
        lte(events.startAt, nextWeek),
        ilike(events.title, "%interroga%"),
      )),
    db.select({ title: events.title, startAt: events.startAt, endAt: events.endAt })
      .from(events)
      .where(and(
        eq(events.familyId, familyId),
        gte(events.startAt, now),
        lte(events.startAt, nextWeek),
      )),
  ]);

  if (tests.length === 0) return null;

  const prompt = `
Sei un assistente per lo studio. Crea un piano di studio settimanale per uno studente in italiano.
Considera i tempi liberi tra le attività. Sessioni di studio di massimo 90 minuti con pausa.
Rispondi SOLO in JSON valido, senza testo aggiuntivo né markdown.

Interrogazioni prossime: ${JSON.stringify(tests)}
Attività settimanali: ${JSON.stringify(activities)}
Data oggi: ${now.toISOString().split("T")[0]}

Esempio di risposta corretta:
{"study_sessions":[{"date":"2026-04-10","time":"15:30","duration_minutes":60,"subject":"Matematica","reason":"Due giorni prima dell'interrogazione, momento ideale per il ripasso"}],"tip":"Alterna 25 minuti di studio a 5 di pausa per mantenere alta la concentrazione."}

Rispondi con lo stesso formato JSON:
  `.trim();

  const raw = await callClaude(prompt, 600);
  return parseJSON<StudyPlan>(raw);
}
