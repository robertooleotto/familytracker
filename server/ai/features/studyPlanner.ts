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
Rispondi SOLO in JSON, nessun testo aggiuntivo.

Interrogazioni prossime: ${JSON.stringify(tests)}
Attività settimanali: ${JSON.stringify(activities)}
Data oggi: ${now.toISOString().split("T")[0]}

JSON richiesto:
{
  "study_sessions": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "duration_minutes": 60,
      "subject": "Matematica",
      "reason": "perché questo momento è ottimale"
    }
  ],
  "tip": "consiglio generale in italiano"
}
  `.trim();

  const raw = await callClaude(prompt, 600);
  return parseJSON<StudyPlan>(raw);
}
