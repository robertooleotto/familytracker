import { db } from "../../db";
import {
  profiles, locations, expenses, events, tasks, shoppingItems,
  medications, aiConversations, aiMessages,
} from "@shared/schema";
import { eq, and, gte, lte, desc, isNull } from "drizzle-orm";
import { callClaudeConversation } from "../aiEngine";

const MAX_HISTORY_MESSAGES = 20; // keep last N messages for context window
const MAX_CONVERSATIONS_OPEN = 5; // max open conversations per user

/**
 * Build a rich system prompt with family context for the conversational assistant.
 */
async function buildFamilySystemPrompt(familyId: string, profileId: string): Promise<string> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const startOfDay = new Date(todayStr + "T00:00:00.000Z");
  const endOfWeek = new Date(now.getTime() + 7 * 86_400_000);

  const [
    membersRes,
    currentUser,
    recentLocations,
    todayExpenses,
    upcomingEvents,
    pendingTasks,
    shoppingList,
    activeMeds,
  ] = await Promise.all([
    db.select({ id: profiles.id, name: profiles.name, role: profiles.role, currentMood: profiles.currentMood })
      .from(profiles)
      .where(eq(profiles.familyId, familyId)),

    db.select({ name: profiles.name, role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, profileId))
      .limit(1),

    db.select({ userId: locations.userId, lat: locations.lat, lng: locations.lng, timestamp: locations.timestamp })
      .from(locations)
      .where(and(eq(locations.familyId, familyId), gte(locations.timestamp, startOfDay)))
      .limit(50),

    db.select({ title: expenses.title, amount: expenses.amount, notes: expenses.notes })
      .from(expenses)
      .where(and(eq(expenses.familyId, familyId), gte(expenses.date, startOfDay))),

    db.select({
      title: events.title, startAt: events.startAt, endAt: events.endAt,
      assignedTo: events.assignedTo, category: events.category,
    })
      .from(events)
      .where(and(
        eq(events.familyId, familyId),
        gte(events.startAt, now),
        lte(events.startAt, endOfWeek),
      ))
      .orderBy(events.startAt)
      .limit(15),

    db.select({ title: tasks.title, assignedTo: tasks.assignedTo, dueDate: tasks.dueDate })
      .from(tasks)
      .where(and(eq(tasks.familyId, familyId), isNull(tasks.completedAt)))
      .limit(10),

    db.select({ name: shoppingItems.name, qty: shoppingItems.qty, checked: shoppingItems.checked })
      .from(shoppingItems)
      .where(and(eq(shoppingItems.familyId, familyId), eq(shoppingItems.checked, false)))
      .limit(20),

    db.select({ name: medications.name, dosage: medications.dosage, profileId: medications.profileId })
      .from(medications)
      .where(and(eq(medications.familyId, familyId), eq(medications.active, true)))
      .limit(10),
  ]);

  const userName = currentUser[0]?.name ?? "utente";
  const totalSpentToday = todayExpenses.reduce((s, e) => s + Math.abs(Number(e.amount)), 0).toFixed(2);

  // Map member IDs to names for readability
  const memberMap = Object.fromEntries(membersRes.map(m => [m.id, m.name]));

  return `Sei l'Assistente Familiare di FamilyTracker, un'app italiana per la gestione della vita familiare.
Stai parlando con ${userName} (${currentUser[0]?.role ?? "membro"}).

REGOLE:
- Rispondi SEMPRE in italiano con tono caldo, amichevole e familiare.
- Usa il "tu" informale.
- Sii conciso ma utile — risposte brevi e pratiche, non elenchi infiniti.
- Puoi dare consigli su organizzazione familiare, spese, calendario, compiti, shopping, salute.
- NON inventare dati che non hai. Se non sai qualcosa, dillo con gentilezza.
- Se ti chiedono cose fuori contesto famiglia (politica, gossip, ecc.), riporta gentilmente la conversazione sulla famiglia.
- Puoi usare emoji con moderazione 😊

CONTESTO FAMIGLIA (aggiornato ad adesso, ${now.toLocaleString("it-IT")}):

👨‍👩‍👧‍👦 Membri: ${membersRes.map(m => `${m.name} (${m.role}, umore: ${m.currentMood ?? "n/d"})`).join(", ")}

📍 Posizioni oggi: ${recentLocations.length} rilevamenti GPS registrati

💰 Spese oggi: ${totalSpentToday}€ — ${todayExpenses.map(e => `${e.title} (${e.amount}€)`).join(", ") || "nessuna spesa"}

📅 Prossimi eventi (7 giorni):
${upcomingEvents.length > 0
  ? upcomingEvents.map(e => {
      const when = new Date(e.startAt).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const who = e.assignedTo?.map(id => memberMap[id] ?? id).join(", ") ?? "tutti";
      return `- ${e.title} (${when}, ${e.category ?? "famiglia"}, per: ${who})`;
    }).join("\n")
  : "Nessun evento in programma"}

✅ Task da completare:
${pendingTasks.length > 0
  ? pendingTasks.map(t => `- ${t.title} → ${t.assignedTo ? memberMap[t.assignedTo] ?? t.assignedTo : "non assegnato"}`).join("\n")
  : "Tutto completato!"}

🛒 Lista della spesa (non acquistati): ${shoppingList.map(s => `${s.name} x${s.qty}`).join(", ") || "lista vuota"}

💊 Farmaci attivi: ${activeMeds.map(m => `${m.name} (${m.dosage ?? "n/d"}) per ${memberMap[m.profileId] ?? m.profileId}`).join(", ") || "nessuno"}
`.trim();
}

/**
 * Get or create an active conversation for a user.
 */
export async function getOrCreateConversation(
  familyId: string,
  profileId: string,
  type: "family_chat" | "tutor" = "family_chat"
): Promise<string> {
  // Find an open conversation of this type
  const [existing] = await db.select({ id: aiConversations.id })
    .from(aiConversations)
    .where(and(
      eq(aiConversations.familyId, familyId),
      eq(aiConversations.profileId, profileId),
      eq(aiConversations.type, type),
      isNull(aiConversations.closedAt),
    ))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(1);

  if (existing) return existing.id;

  // Create new conversation
  const [conv] = await db.insert(aiConversations).values({
    familyId,
    profileId,
    type,
    title: type === "family_chat" ? "Chat con Assistente" : "Sessione Tutor",
  }).returning({ id: aiConversations.id });

  return conv.id;
}

/**
 * Load conversation history from DB.
 */
export async function loadConversationHistory(
  conversationId: string,
  limit = MAX_HISTORY_MESSAGES
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const rows = await db.select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(desc(aiMessages.createdAt))
    .limit(limit);

  // Reverse to get chronological order
  return rows.reverse().map(r => ({
    role: r.role as "user" | "assistant",
    content: r.content,
  }));
}

/**
 * Save a message to the conversation.
 */
export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  tokensUsed?: number
): Promise<void> {
  await db.insert(aiMessages).values({
    conversationId,
    role,
    content,
    tokensUsed,
  });
  // Update conversation timestamp
  await db.update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, conversationId));
}

/**
 * Main family chat handler.
 */
export async function handleFamilyChat(
  familyId: string,
  profileId: string,
  userMessage: string,
  conversationId?: string
): Promise<{ response: string; conversationId: string } | null> {
  // Get or create conversation
  const convId = conversationId
    ? conversationId
    : await getOrCreateConversation(familyId, profileId, "family_chat");

  // Save user message
  await saveMessage(convId, "user", userMessage);

  // Build system prompt with live family context
  const systemPrompt = await buildFamilySystemPrompt(familyId, profileId);

  // Load conversation history
  const history = await loadConversationHistory(convId);

  // Call Claude
  const response = await callClaudeConversation(systemPrompt, history, 800, false);

  if (!response) {
    // Remove user message if Claude failed
    return null;
  }

  // Save assistant response
  await saveMessage(convId, "assistant", response);

  return { response, conversationId: convId };
}

/**
 * Close a conversation (archive it).
 */
export async function closeConversation(conversationId: string): Promise<void> {
  await db.update(aiConversations)
    .set({ closedAt: new Date() })
    .where(eq(aiConversations.id, conversationId));
}

/**
 * List conversations for a user.
 */
export async function listConversations(
  familyId: string,
  profileId: string,
  type: "family_chat" | "tutor" = "family_chat",
  includeArchived = false
): Promise<Array<{ id: string; title: string | null; updatedAt: Date; closedAt: Date | null }>> {
  const conditions = [
    eq(aiConversations.familyId, familyId),
    eq(aiConversations.profileId, profileId),
    eq(aiConversations.type, type),
  ];
  if (!includeArchived) {
    conditions.push(isNull(aiConversations.closedAt));
  }

  return db.select({
    id: aiConversations.id,
    title: aiConversations.title,
    updatedAt: aiConversations.updatedAt,
    closedAt: aiConversations.closedAt,
  })
    .from(aiConversations)
    .where(and(...conditions))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(20);
}
