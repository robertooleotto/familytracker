import { db } from "../../db";
import {
  profiles, events, tutorSessions, aiConversations, aiMessages,
  schoolGrades, schoolHomework,
} from "@shared/schema";
import { eq, and, gte, desc, isNull, ilike } from "drizzle-orm";
import { callClaudeConversation, parseJSON, saveInsight } from "../aiEngine";
import {
  getOrCreateConversation, loadConversationHistory, saveMessage, closeConversation,
} from "./familyChat";

/**
 * Calculate the child's age from their birthDate.
 */
function calculateAge(birthDate: string | Date | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Build tutor system prompt calibrated to the child's age and subject.
 */
async function buildTutorSystemPrompt(
  familyId: string,
  childId: string,
  subject: string,
  topic?: string | null,
  difficulty?: string | null
): Promise<string> {
  const [child] = await db.select({
    name: profiles.name,
    birthDate: profiles.birthDate,
    role: profiles.role,
  })
    .from(profiles)
    .where(eq(profiles.id, childId))
    .limit(1);

  const childName = child?.name ?? "studente";
  const age = calculateAge(child?.birthDate ?? null);
  const ageStr = age ? `${age} anni` : "età non specificata";

  // Fetch recent grades for the subject to understand level
  let gradesContext = "";
  try {
    const recentGrades = await db.select({
      grade: schoolGrades.grade,
      gradeStr: schoolGrades.gradeStr,
      date: schoolGrades.date,
      notes: schoolGrades.notes,
    })
      .from(schoolGrades)
      .where(and(
        eq(schoolGrades.familyId, familyId),
        ilike(schoolGrades.subjectName, `%${subject}%`),
      ))
      .orderBy(desc(schoolGrades.date))
      .limit(5);

    if (recentGrades.length > 0) {
      const avgGrade = recentGrades
        .filter(g => g.grade != null)
        .reduce((sum, g) => sum + (g.grade ?? 0), 0) / (recentGrades.filter(g => g.grade != null).length || 1);
      gradesContext = `\nVoti recenti in ${subject}: media ${avgGrade.toFixed(1)}/10. Ultimi voti: ${recentGrades.map(g => g.gradeStr ?? g.grade).join(", ")}`;
    }
  } catch {
    // school_grades table might not have data, that's ok
  }

  // Fetch pending homework
  let homeworkContext = "";
  try {
    const homework = await db.select({
      description: schoolHomework.description,
      dueDate: schoolHomework.dueDate,
    })
      .from(schoolHomework)
      .where(and(
        eq(schoolHomework.familyId, familyId),
        ilike(schoolHomework.subjectName, `%${subject}%`),
        eq(schoolHomework.done, false),
      ))
      .limit(3);

    if (homework.length > 0) {
      homeworkContext = `\nCompiti pendenti: ${homework.map(h => h.description).join("; ")}`;
    }
  } catch {
    // school_homework might not have data
  }

  const difficultyMap: Record<string, string> = {
    easy: "semplice — usa spiegazioni molto basiche, esempi concreti dalla vita quotidiana, e linguaggio facile",
    medium: "medio — spiega in modo chiaro con esempi, ma senza semplificare troppo",
    hard: "avanzato — puoi usare terminologia tecnica e affrontare aspetti complessi",
  };
  const difficultyInstructions = difficultyMap[difficulty ?? "medium"] ?? difficultyMap.medium;

  return `Sei un tutor privato virtuale di nome "Tutor FamilyTracker". Stai aiutando ${childName} (${ageStr}) a studiare ${subject}${topic ? ` — argomento specifico: ${topic}` : ""}.

REGOLE FONDAMENTALI:
- Rispondi SEMPRE in italiano.
- Adatta il linguaggio e la complessità all'età dello studente (${ageStr}).
- Livello di difficoltà impostato: ${difficultyInstructions}.
- Sii incoraggiante, paziente e positivo. Celebra i progressi! 🌟
- Usa il metodo socratico: fai domande guida invece di dare subito la risposta.
- Quando lo studente sbaglia, non dire "sbagliato!" — riformula con "quasi ci sei!" o "proviamo così...".
- Proponi esercizi pratici e verifiche intermedie.
- Ogni 4-5 scambi, fai un breve riepilogo di cosa è stato imparato.
- Se lo studente è frustrato o stanco, proponi una pausa o cambia approccio.
- NON dare risposte complete ai compiti — guida lo studente a trovarle da solo.
- Puoi usare emoji per rendere lo studio più divertente 📚✨

MATERIA: ${subject}
${topic ? `ARGOMENTO: ${topic}` : ""}
${gradesContext}
${homeworkContext}

STRUTTURA SESSIONE:
1. Inizia chiedendo cosa vuole studiare o dove ha difficoltà
2. Verifica le conoscenze base con una domanda semplice
3. Spiega i concetti partendo dal semplice al complesso
4. Proponi esercizi di verifica
5. Dai feedback costruttivo
6. Riassumi cosa è stato imparato alla fine`.trim();
}

/**
 * Start or continue a tutor session.
 */
export async function handleTutorChat(
  familyId: string,
  profileId: string, // who is calling (can be child or parent)
  childId: string,
  subject: string,
  userMessage: string,
  conversationId?: string,
  topic?: string,
  difficulty?: string
): Promise<{
  response: string;
  conversationId: string;
  sessionId: string;
} | null> {
  // Get or create conversation
  let convId: string;
  let sessionId: string;

  if (conversationId) {
    convId = conversationId;
    // Find existing tutor session
    const [existingSession] = await db.select({ id: tutorSessions.id })
      .from(tutorSessions)
      .where(eq(tutorSessions.conversationId, convId))
      .limit(1);
    sessionId = existingSession?.id ?? "";

    if (!sessionId) {
      // Orphan conversation, create session
      const [newSession] = await db.insert(tutorSessions).values({
        conversationId: convId,
        familyId,
        childId,
        subject,
        topic: topic ?? null,
        difficulty: difficulty ?? "medium",
      }).returning({ id: tutorSessions.id });
      sessionId = newSession.id;
    }
  } else {
    // Create new conversation and session
    convId = await getOrCreateConversation(familyId, profileId, "tutor");

    // Update conversation title
    await db.update(aiConversations)
      .set({
        title: `Tutor: ${subject}${topic ? ` — ${topic}` : ""}`,
        metadata: { childId, subject, topic, difficulty },
      })
      .where(eq(aiConversations.id, convId));

    const [newSession] = await db.insert(tutorSessions).values({
      conversationId: convId,
      familyId,
      childId,
      subject,
      topic: topic ?? null,
      difficulty: difficulty ?? "medium",
    }).returning({ id: tutorSessions.id });
    sessionId = newSession.id;
  }

  // Save user message
  await saveMessage(convId, "user", userMessage);

  // Build system prompt
  const systemPrompt = await buildTutorSystemPrompt(familyId, childId, subject, topic, difficulty);

  // Load history
  const history = await loadConversationHistory(convId);

  // Call Claude with PREMIUM model for better reasoning
  const response = await callClaudeConversation(systemPrompt, history, 1500, true);

  if (!response) return null;

  // Save assistant response
  await saveMessage(convId, "assistant", response);

  // Update session stats
  await db.update(tutorSessions)
    .set({
      questionsAsked: (await db.select({ count: aiMessages.id })
        .from(aiMessages)
        .where(and(
          eq(aiMessages.conversationId, convId),
          eq(aiMessages.role, "user"),
        ))).length,
      updatedAt: new Date(),
    })
    .where(eq(tutorSessions.id, sessionId));

  return { response, conversationId: convId, sessionId };
}

/**
 * Generate a parent report for a tutor session.
 */
export async function generateTutorReport(
  sessionId: string
): Promise<{
  subject: string;
  childName: string;
  summary: string;
  questionsAsked: number;
  duration: string;
  strengths: string[];
  difficulties: string[];
  suggestions: string[];
} | null> {
  // Load session data
  const [session] = await db.select()
    .from(tutorSessions)
    .where(eq(tutorSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  // Load child info
  const [child] = await db.select({ name: profiles.name })
    .from(profiles)
    .where(eq(profiles.id, session.childId))
    .limit(1);

  // Load full conversation
  const messages = await db.select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, session.conversationId))
    .orderBy(aiMessages.createdAt);

  if (messages.length < 2) return null;

  const conversationText = messages
    .map(m => `${m.role === "user" ? "Studente" : "Tutor"}: ${m.content}`)
    .join("\n\n");

  // Calculate approximate duration
  const firstMsg = await db.select({ createdAt: aiMessages.createdAt })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, session.conversationId))
    .orderBy(aiMessages.createdAt)
    .limit(1);
  const lastMsg = await db.select({ createdAt: aiMessages.createdAt })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, session.conversationId))
    .orderBy(desc(aiMessages.createdAt))
    .limit(1);

  const durationMs = firstMsg[0] && lastMsg[0]
    ? new Date(lastMsg[0].createdAt).getTime() - new Date(firstMsg[0].createdAt).getTime()
    : 0;
  const durationMin = Math.max(1, Math.round(durationMs / 60000));

  const prompt = `Analizza questa sessione di studio tra un tutor AI e uno studente.
Genera un report per i genitori in formato JSON.

Materia: ${session.subject}
Argomento: ${session.topic ?? "generale"}
Studente: ${child?.name ?? "studente"}
Durata: circa ${durationMin} minuti

CONVERSAZIONE:
${conversationText.slice(0, 3000)}

Rispondi SOLO in JSON:
{
  "summary": "riepilogo breve della sessione in italiano (2-3 frasi)",
  "strengths": ["punto di forza 1", "punto di forza 2"],
  "difficulties": ["difficoltà riscontrata 1"],
  "suggestions": ["suggerimento per migliorare 1", "suggerimento 2"]
}`;

  const raw = await callClaudeConversation(
    "Sei un analista educativo. Rispondi SOLO in JSON valido.",
    [{ role: "user", content: prompt }],
    800,
    false // Use standard model for reports
  );

  const parsed = parseJSON<{
    summary: string;
    strengths: string[];
    difficulties: string[];
    suggestions: string[];
  }>(raw);

  if (!parsed) return null;

  // Mark report as sent
  await db.update(tutorSessions)
    .set({ parentReportSent: true, durationMinutes: durationMin })
    .where(eq(tutorSessions.id, sessionId));

  // Save as insight for the family
  await saveInsight(
    session.familyId,
    "tutor_report",
    `Sessione di ${session.subject} per ${child?.name}: ${parsed.summary}`,
    "info"
  );

  return {
    subject: session.subject,
    childName: child?.name ?? "studente",
    summary: parsed.summary,
    questionsAsked: session.questionsAsked,
    duration: `${durationMin} minuti`,
    strengths: parsed.strengths,
    difficulties: parsed.difficulties,
    suggestions: parsed.suggestions,
  };
}

/**
 * End a tutor session, close conversation and optionally generate report.
 */
export async function endTutorSession(
  sessionId: string,
  generateReport = true
): Promise<{
  report: Awaited<ReturnType<typeof generateTutorReport>> | null;
} | null> {
  const [session] = await db.select()
    .from(tutorSessions)
    .where(eq(tutorSessions.id, sessionId))
    .limit(1);

  if (!session) return null;

  // Close the conversation
  await closeConversation(session.conversationId);

  // Generate report if requested
  const report = generateReport ? await generateTutorReport(sessionId) : null;

  return { report };
}

/**
 * List tutor sessions for a child.
 */
export async function listTutorSessions(
  familyId: string,
  childId: string,
  limit = 10
): Promise<Array<{
  id: string;
  subject: string;
  topic: string | null;
  questionsAsked: number;
  durationMinutes: number;
  createdAt: Date;
}>> {
  return db.select({
    id: tutorSessions.id,
    subject: tutorSessions.subject,
    topic: tutorSessions.topic,
    questionsAsked: tutorSessions.questionsAsked,
    durationMinutes: tutorSessions.durationMinutes,
    createdAt: tutorSessions.createdAt,
  })
    .from(tutorSessions)
    .where(and(
      eq(tutorSessions.familyId, familyId),
      eq(tutorSessions.childId, childId),
    ))
    .orderBy(desc(tutorSessions.createdAt))
    .limit(limit);
}
