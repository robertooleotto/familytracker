import { db } from "../../db";
import {
  profiles, locations, expenses, events, tasks, shoppingItems,
  medications, aiConversations, aiMessages,
} from "@shared/schema";
import { eq, and, gte, lte, desc, isNull } from "drizzle-orm";
import { callClaudeConversation, callClaudeConversationStream, callClaudeWithTools } from "../aiEngine";
import type { ToolContext } from "../tools";

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

AZIONI — HAI DEGLI STRUMENTI A DISPOSIZIONE:
- Puoi AGIRE: creare eventi, spese, task, aggiungere alla lista spesa, segnare farmaci, mandare messaggi.
- Quando l'utente ti chiede di fare qualcosa (aggiungere, creare, segnare, comprare, mandare), USA LO STRUMENTO appropriato.
- Dopo aver usato uno strumento, conferma brevemente l'azione fatta.
- Se l'utente chiede informazioni (eventi, posizioni, spese, task, lista spesa), usa gli strumenti get_* per ottenere dati aggiornati.
- Per assegnare task o eventi a membri specifici, usa prima get_family_members per ottenere gli ID.
- Se non sei sicuro di un dettaglio (data, ora, persona), chiedi conferma PRIMA di agire.

MAPPA ID MEMBRI:
${membersRes.map(m => `${m.name} → ${m.id}`).join("\n")}

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
 * Detect chat topics from user message to enrich system prompt.
 */
function detectChatTopic(message: string): string[] {
  const topics: string[] = [];
  const lower = message.toLowerCase();

  if (/spes[aei]|costo|pagat|soldi|euro|€|budget|bolletta/.test(lower)) topics.push('expenses');
  if (/dove|posizion|trova|mappa|gps|luogo/.test(lower)) topics.push('location');
  if (/impegn|evento|agenda|calendario|appuntamento|domani|settimana/.test(lower)) topics.push('calendar');
  if (/spesa|lista|comprare|supermercato|negozio/.test(lower)) topics.push('shopping');
  if (/farmac|medicina|pastigli|ricetta|salute|dottore|medico/.test(lower)) topics.push('health');
  if (/compit|task|fare|assegnat|pulizia|faccend/.test(lower)) topics.push('tasks');
  if (/studio|scuola|voto|interroga|esame|compito/.test(lower)) topics.push('school');
  if (/riassunto|riepilogo|report|panoramica|come (va|stiamo)/.test(lower)) topics.push('summary');

  return topics.length > 0 ? topics : ['general'];
}

/**
 * Get or create an active conversation for a user.
 */
export async function getOrCreateConversation(
  familyId: string,
  profileId: string,
  type: "family_chat" = "family_chat"
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
    title: "Chat con Assistente",
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

  // Detect topics and enrich prompt
  const topics = detectChatTopic(userMessage);
  let enrichedPrompt = systemPrompt;
  if (topics.includes('expenses')) {
    enrichedPrompt += '\n\nL\'utente sta chiedendo di spese/finanze. Concentrati sui dati economici disponibili, dai dettagli specifici e consigli pratici sul budget.';
  }
  if (topics.includes('calendar')) {
    enrichedPrompt += '\n\nL\'utente chiede di impegni/calendario. Concentrati sugli eventi imminenti, segnala sovrapposizioni o giornate intense, suggerisci come organizzarsi.';
  }
  if (topics.includes('health')) {
    enrichedPrompt += '\n\nL\'utente chiede di salute/farmaci. Concentrati sui farmaci attivi e ricorda gli orari di assunzione se disponibili.';
  }
  if (topics.includes('location')) {
    enrichedPrompt += '\n\nL\'utente chiede dove si trovano i familiari. Fornisci le informazioni GPS più recenti in modo chiaro e rassicurante.';
  }
  if (topics.includes('shopping')) {
    enrichedPrompt += '\n\nL\'utente chiede della lista spesa. Elenca cosa manca, suggerisci aggiunte basate sulle abitudini.';
  }
  if (topics.includes('summary')) {
    enrichedPrompt += '\n\nL\'utente vuole un riepilogo. Fornisci una panoramica concisa ma completa della situazione familiare attuale.';
  }

  // Load conversation history
  const history = await loadConversationHistory(convId);

  // Call Claude
  const response = await callClaudeConversation(enrichedPrompt, history, 800, false);

  if (!response) {
    // Remove user message if Claude failed
    return null;
  }

  // Save assistant response
  await saveMessage(convId, "assistant", response);

  return { response, conversationId: convId };
}

/**
 * Stream-based family chat handler.
 * Returns a stream of text deltas and a callback to save the complete response.
 */
export async function handleFamilyChatStream(
  familyId: string,
  profileId: string,
  userMessage: string,
  conversationId?: string
): Promise<{ stream: ReadableStream<string>; conversationId: string; onComplete: (fullText: string) => Promise<void> } | null> {
  // Get or create conversation
  const convId = conversationId
    ? conversationId
    : await getOrCreateConversation(familyId, profileId, "family_chat");

  // Save user message
  await saveMessage(convId, "user", userMessage);

  // Build system prompt with live family context
  const systemPrompt = await buildFamilySystemPrompt(familyId, profileId);

  // Detect topics and enrich prompt
  const topics = detectChatTopic(userMessage);
  let enrichedPrompt = systemPrompt;
  if (topics.includes('expenses')) {
    enrichedPrompt += '\n\nL\'utente sta chiedendo di spese/finanze. Concentrati sui dati economici disponibili, dai dettagli specifici e consigli pratici sul budget.';
  }
  if (topics.includes('calendar')) {
    enrichedPrompt += '\n\nL\'utente chiede di impegni/calendario. Concentrati sugli eventi imminenti, segnala sovrapposizioni o giornate intense, suggerisci come organizzarsi.';
  }
  if (topics.includes('health')) {
    enrichedPrompt += '\n\nL\'utente chiede di salute/farmaci. Concentrati sui farmaci attivi e ricorda gli orari di assunzione se disponibili.';
  }
  if (topics.includes('location')) {
    enrichedPrompt += '\n\nL\'utente chiede dove si trovano i familiari. Fornisci le informazioni GPS più recenti in modo chiaro e rassicurante.';
  }
  if (topics.includes('shopping')) {
    enrichedPrompt += '\n\nL\'utente chiede della lista spesa. Elenca cosa manca, suggerisci aggiunte basate sulle abitudini.';
  }
  if (topics.includes('summary')) {
    enrichedPrompt += '\n\nL\'utente vuole un riepilogo. Fornisci una panoramica concisa ma completa della situazione familiare attuale.';
  }

  // Load conversation history
  const history = await loadConversationHistory(convId);

  // Call Claude with streaming
  const stream = await callClaudeConversationStream(enrichedPrompt, history, 800, false);

  if (!stream) {
    return null;
  }

  return {
    stream,
    conversationId: convId,
    onComplete: async (fullText: string) => {
      await saveMessage(convId, "assistant", fullText);
    },
  };
}

/**
 * Tool-based family chat handler.
 * Uses callClaudeWithTools to let the AI execute actions.
 * Sends SSE events for text deltas and tool actions.
 */
export async function handleFamilyChatWithTools(
  familyId: string,
  profileId: string,
  userMessage: string,
  conversationId: string | undefined,
  sendEvent: (event: string, data: string) => void,
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

  // Get profile name for tool context
  const [currentUser] = await db.select({ name: profiles.name })
    .from(profiles).where(eq(profiles.id, profileId)).limit(1);

  const toolCtx: ToolContext = {
    familyId,
    profileId,
    profileName: currentUser?.name ?? "utente",
  };

  // Send conversation metadata
  sendEvent("meta", JSON.stringify({ conversationId: convId }));

  // Call Claude with tools
  const response = await callClaudeWithTools(
    systemPrompt,
    history,
    toolCtx,
    {
      onDelta: (text) => {
        sendEvent("delta", JSON.stringify(text));
      },
      onToolUse: (name, result) => {
        sendEvent("tool", JSON.stringify({ name, result }));
      },
    },
    1200,
  );

  if (!response) {
    sendEvent("error", "unavailable");
    return null;
  }

  // Save assistant response
  await saveMessage(convId, "assistant", response);

  sendEvent("done", "ok");
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
  type: "family_chat" = "family_chat",
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
