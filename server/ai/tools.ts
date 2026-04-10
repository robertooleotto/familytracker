/**
 * AI Tool System — defines all tools the Claude assistant can call
 * to take actions on behalf of the user (add events, expenses, etc.).
 *
 * Each tool has:
 *   - A Claude-compatible tool definition (name, description, input_schema)
 *   - An executor function that performs the action and returns a result string
 */

import { db } from "../db";
import {
  events, expenses, shoppingItems, tasks, medications,
  messages, profiles, locations, budgetCategories,
} from "@shared/schema";
import { eq, and, gte, lte, desc, isNull, asc } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolContext {
  familyId: string;
  profileId: string;
  profileName: string;
}

type ToolExecutor = (input: Record<string, unknown>, ctx: ToolContext) => Promise<string>;

// ── Tool Definitions (sent to Claude API) ────────────────────────────────────

export const AI_TOOLS: ToolDefinition[] = [
  {
    name: "add_event",
    description: "Crea un nuovo evento nel calendario familiare. Usa questo strumento quando l'utente chiede di aggiungere un appuntamento, impegno, promemoria o evento.",
    input_schema: {
      type: "object",
      properties: {
        title:       { type: "string", description: "Titolo dell'evento" },
        startAt:     { type: "string", description: "Data e ora di inizio in formato ISO 8601 (es. 2026-04-15T09:00:00)" },
        endAt:       { type: "string", description: "Data e ora di fine (opzionale)" },
        category:    { type: "string", enum: ["school", "sport", "work", "health", "family", "personal"], description: "Categoria dell'evento" },
        description: { type: "string", description: "Descrizione aggiuntiva (opzionale)" },
        allDay:      { type: "boolean", description: "Se è un evento per tutta la giornata" },
        assignedTo:  { type: "array", items: { type: "string" }, description: "Array di ID dei membri assegnati (opzionale)" },
        locationName: { type: "string", description: "Luogo dell'evento (opzionale)" },
        reminderMin: { type: "number", description: "Minuti di preavviso per il promemoria (default 30)" },
      },
      required: ["title", "startAt"],
    },
  },
  {
    name: "add_expense",
    description: "Registra una nuova spesa nel budget familiare. Usa quando l'utente dice di aver speso soldi o vuole tracciare una spesa.",
    input_schema: {
      type: "object",
      properties: {
        title:  { type: "string", description: "Descrizione della spesa (es. 'Spesa Esselunga', 'Benzina')" },
        amount: { type: "number", description: "Importo in euro (numero positivo)" },
        notes:  { type: "string", description: "Note aggiuntive (opzionale)" },
        date:   { type: "string", description: "Data della spesa in ISO 8601 (default: oggi)" },
      },
      required: ["title", "amount"],
    },
  },
  {
    name: "add_shopping_items",
    description: "Aggiunge uno o più prodotti alla lista della spesa. Usa quando l'utente chiede di aggiungere cose da comprare.",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name:     { type: "string", description: "Nome del prodotto" },
              qty:      { type: "number", description: "Quantità (default 1)" },
              category: { type: "string", description: "Categoria: produce, dairy, meat, bakery, frozen, beverages, snacks, household, other" },
            },
            required: ["name"],
          },
          description: "Lista dei prodotti da aggiungere",
        },
      },
      required: ["items"],
    },
  },
  {
    name: "add_task",
    description: "Crea un nuovo compito/task da assegnare a un membro della famiglia. Usa quando l'utente vuole creare un promemoria, un compito o un'attività.",
    input_schema: {
      type: "object",
      properties: {
        title:       { type: "string", description: "Titolo del task" },
        description: { type: "string", description: "Descrizione (opzionale)" },
        assignedTo:  { type: "string", description: "ID del membro a cui assegnare (opzionale)" },
        dueDate:     { type: "string", description: "Scadenza in formato ISO 8601 (opzionale)" },
        recurrence:  { type: "string", enum: ["once", "daily", "weekly", "monthly"], description: "Ricorrenza (default: once)" },
        points:      { type: "number", description: "Punti premio (default 10)" },
      },
      required: ["title"],
    },
  },
  {
    name: "mark_medication_taken",
    description: "Segna un farmaco come preso/assunto. Usa quando l'utente dice di aver preso una medicina.",
    input_schema: {
      type: "object",
      properties: {
        medicationName: { type: "string", description: "Nome del farmaco da segnare come preso" },
        profileName:    { type: "string", description: "Nome della persona che ha preso il farmaco (se diverso dall'utente corrente)" },
      },
      required: ["medicationName"],
    },
  },
  {
    name: "send_family_message",
    description: "Invia un messaggio nella chat familiare a nome dell'utente. Usa quando l'utente chiede di mandare un messaggio alla famiglia.",
    input_schema: {
      type: "object",
      properties: {
        body: { type: "string", description: "Testo del messaggio da inviare" },
      },
      required: ["body"],
    },
  },
  {
    name: "complete_task",
    description: "Segna un task come completato. Usa quando l'utente dice di aver finito un compito.",
    input_schema: {
      type: "object",
      properties: {
        taskTitle: { type: "string", description: "Titolo (o parte del titolo) del task da completare" },
      },
      required: ["taskTitle"],
    },
  },
  {
    name: "check_shopping_item",
    description: "Segna un prodotto della lista della spesa come acquistato/spuntato.",
    input_schema: {
      type: "object",
      properties: {
        itemName: { type: "string", description: "Nome (o parte del nome) del prodotto da spuntare" },
      },
      required: ["itemName"],
    },
  },
  {
    name: "get_family_members",
    description: "Restituisce la lista dei membri della famiglia con i loro ID, nomi e ruoli. Utile per assegnare task, eventi o farmaci.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_family_locations",
    description: "Restituisce le posizioni più recenti di tutti i membri della famiglia.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_upcoming_events",
    description: "Restituisce gli eventi nei prossimi N giorni.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Numero di giorni da controllare (default 7)" },
      },
    },
  },
  {
    name: "get_pending_tasks",
    description: "Restituisce i task non ancora completati.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_shopping_list",
    description: "Restituisce la lista della spesa corrente (prodotti non ancora acquistati).",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_today_expenses",
    description: "Restituisce le spese di oggi con il totale.",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Numero di giorni indietro (default 1 = solo oggi)" },
      },
    },
  },
];

// ── Tool Executors ───────────────────────────────────────────────────────────

const executors: Record<string, ToolExecutor> = {

  async add_event(input, ctx) {
    const [created] = await db.insert(events).values({
      familyId: ctx.familyId,
      title: input.title as string,
      startAt: new Date(input.startAt as string),
      endAt: input.endAt ? new Date(input.endAt as string) : null,
      category: (input.category as string) || "family",
      description: (input.description as string) || null,
      allDay: (input.allDay as boolean) || false,
      assignedTo: (input.assignedTo as string[]) || [],
      locationName: (input.locationName as string) || null,
      reminderMin: (input.reminderMin as number) || 30,
      aiSuggested: true,
      createdBy: ctx.profileId,
    }).returning({ id: events.id, title: events.title, startAt: events.startAt });

    const when = new Date(created.startAt).toLocaleString("it-IT", {
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    });
    return `✅ Evento "${created.title}" creato per ${when}.`;
  },

  async add_expense(input, ctx) {
    const amount = Math.abs(input.amount as number);
    const [created] = await db.insert(expenses).values({
      familyId: ctx.familyId,
      title: input.title as string,
      amount: String(amount),
      notes: (input.notes as string) || null,
      date: input.date ? new Date(input.date as string) : new Date(),
      addedBy: ctx.profileId,
    }).returning({ id: expenses.id, title: expenses.title, amount: expenses.amount });

    return `✅ Spesa "${created.title}" di ${Number(created.amount).toFixed(2)}€ registrata.`;
  },

  async add_shopping_items(input, ctx) {
    const items = input.items as Array<{ name: string; qty?: number; category?: string }>;
    const values = items.map(item => ({
      familyId: ctx.familyId,
      name: item.name,
      qty: item.qty || 1,
      category: item.category || "other",
      addedBy: ctx.profileId,
    }));
    await db.insert(shoppingItems).values(values);
    const names = items.map(i => i.name).join(", ");
    return `✅ ${items.length} prodott${items.length === 1 ? "o" : "i"} aggiunti alla lista: ${names}.`;
  },

  async add_task(input, ctx) {
    const [created] = await db.insert(tasks).values({
      familyId: ctx.familyId,
      title: input.title as string,
      description: (input.description as string) || null,
      assignedTo: (input.assignedTo as string) || null,
      dueDate: input.dueDate ? new Date(input.dueDate as string) : null,
      recurrence: (input.recurrence as string) || "once",
      points: (input.points as number) || 10,
      createdBy: ctx.profileId,
    }).returning({ id: tasks.id, title: tasks.title });

    return `✅ Task "${created.title}" creato.`;
  },

  async mark_medication_taken(input, ctx) {
    const medName = (input.medicationName as string).toLowerCase();

    // Find the medication by name (fuzzy)
    const meds = await db.select({ id: medications.id, name: medications.name, profileId: medications.profileId })
      .from(medications)
      .where(and(eq(medications.familyId, ctx.familyId), eq(medications.active, true)));

    const match = meds.find(m => m.name.toLowerCase().includes(medName));
    if (!match) {
      return `❌ Non ho trovato un farmaco attivo che corrisponda a "${input.medicationName}". Farmaci attivi: ${meds.map(m => m.name).join(", ") || "nessuno"}.`;
    }

    await db.update(medications)
      .set({ lastTakenAt: new Date() })
      .where(eq(medications.id, match.id));

    return `✅ "${match.name}" segnato come preso adesso.`;
  },

  async send_family_message(input, ctx) {
    const body = (input.body as string).trim();
    if (!body) return "❌ Il messaggio è vuoto.";

    await db.insert(messages).values({
      familyId: ctx.familyId,
      senderId: ctx.profileId,
      body,
      readBy: [ctx.profileId],
    });

    return `✅ Messaggio inviato nella chat familiare: "${body.slice(0, 80)}${body.length > 80 ? "..." : ""}"`;
  },

  async complete_task(input, ctx) {
    const title = (input.taskTitle as string).toLowerCase();
    const pending = await db.select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.familyId, ctx.familyId), isNull(tasks.completedAt)));

    const match = pending.find(t => t.title.toLowerCase().includes(title));
    if (!match) {
      return `❌ Non ho trovato un task aperto che corrisponda a "${input.taskTitle}". Task aperti: ${pending.map(t => t.title).join(", ") || "nessuno"}.`;
    }

    await db.update(tasks)
      .set({ completedAt: new Date(), verifiedBy: ctx.profileId })
      .where(eq(tasks.id, match.id));

    return `✅ Task "${match.title}" completato!`;
  },

  async check_shopping_item(input, ctx) {
    const name = (input.itemName as string).toLowerCase();
    const unchecked = await db.select({ id: shoppingItems.id, name: shoppingItems.name })
      .from(shoppingItems)
      .where(and(eq(shoppingItems.familyId, ctx.familyId), eq(shoppingItems.checked, false)));

    const match = unchecked.find(i => i.name.toLowerCase().includes(name));
    if (!match) {
      return `❌ Non ho trovato "${input.itemName}" nella lista. Prodotti non acquistati: ${unchecked.map(i => i.name).join(", ") || "lista vuota"}.`;
    }

    await db.update(shoppingItems)
      .set({ checked: true, checkedBy: ctx.profileId })
      .where(eq(shoppingItems.id, match.id));

    return `✅ "${match.name}" spuntato dalla lista!`;
  },

  async get_family_members(_input, ctx) {
    const members = await db.select({ id: profiles.id, name: profiles.name, role: profiles.role, currentMood: profiles.currentMood })
      .from(profiles)
      .where(eq(profiles.familyId, ctx.familyId));

    if (!members.length) return "Nessun membro trovato.";
    return members.map(m => `- ${m.name} (${m.role}, umore: ${m.currentMood ?? "n/d"}, ID: ${m.id})`).join("\n");
  },

  async get_family_locations(_input, ctx) {
    // Get latest location per member
    const members = await db.select({ id: profiles.id, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.familyId, ctx.familyId));

    const results: string[] = [];
    for (const m of members) {
      const [loc] = await db.select({
        lat: locations.lat, lng: locations.lng,
        timestamp: locations.timestamp, speed: locations.speed, batteryPct: locations.batteryPct,
      })
        .from(locations)
        .where(eq(locations.userId, m.id))
        .orderBy(desc(locations.timestamp))
        .limit(1);

      if (loc) {
        const ago = Math.round((Date.now() - new Date(loc.timestamp).getTime()) / 60000);
        results.push(`- ${m.name}: lat ${loc.lat}, lng ${loc.lng} (${ago} min fa, batteria: ${loc.batteryPct ?? "n/d"}%)`);
      } else {
        results.push(`- ${m.name}: posizione non disponibile`);
      }
    }
    return results.join("\n");
  },

  async get_upcoming_events(input, ctx) {
    const days = (input.days as number) || 7;
    const now = new Date();
    const end = new Date(now.getTime() + days * 86_400_000);

    const memberMap = Object.fromEntries(
      (await db.select({ id: profiles.id, name: profiles.name }).from(profiles).where(eq(profiles.familyId, ctx.familyId)))
        .map(m => [m.id, m.name])
    );

    const rows = await db.select({
      title: events.title, startAt: events.startAt, endAt: events.endAt,
      category: events.category, assignedTo: events.assignedTo, locationName: events.locationName,
    })
      .from(events)
      .where(and(eq(events.familyId, ctx.familyId), gte(events.startAt, now), lte(events.startAt, end)))
      .orderBy(asc(events.startAt))
      .limit(20);

    if (!rows.length) return `Nessun evento nei prossimi ${days} giorni.`;

    return rows.map(e => {
      const when = new Date(e.startAt).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      const who = e.assignedTo?.map(id => memberMap[id] ?? id).join(", ") || "tutti";
      return `- ${e.title} | ${when} | ${e.category} | per: ${who}${e.locationName ? ` | 📍 ${e.locationName}` : ""}`;
    }).join("\n");
  },

  async get_pending_tasks(_input, ctx) {
    const memberMap = Object.fromEntries(
      (await db.select({ id: profiles.id, name: profiles.name }).from(profiles).where(eq(profiles.familyId, ctx.familyId)))
        .map(m => [m.id, m.name])
    );

    const rows = await db.select({ title: tasks.title, assignedTo: tasks.assignedTo, dueDate: tasks.dueDate, recurrence: tasks.recurrence })
      .from(tasks)
      .where(and(eq(tasks.familyId, ctx.familyId), isNull(tasks.completedAt)))
      .limit(20);

    if (!rows.length) return "Nessun task in sospeso — tutto fatto! 🎉";

    return rows.map(t => {
      const who = t.assignedTo ? memberMap[t.assignedTo] ?? t.assignedTo : "non assegnato";
      const due = t.dueDate ? ` | scadenza: ${new Date(t.dueDate).toLocaleDateString("it-IT")}` : "";
      return `- ${t.title} → ${who}${due} (${t.recurrence})`;
    }).join("\n");
  },

  async get_shopping_list(_input, ctx) {
    const rows = await db.select({ name: shoppingItems.name, qty: shoppingItems.qty, category: shoppingItems.category })
      .from(shoppingItems)
      .where(and(eq(shoppingItems.familyId, ctx.familyId), eq(shoppingItems.checked, false)))
      .limit(50);

    if (!rows.length) return "La lista della spesa è vuota! 🛒";

    return rows.map(i => `- ${i.name} x${i.qty}${i.category ? ` (${i.category})` : ""}`).join("\n");
  },

  async get_today_expenses(input, ctx) {
    const days = (input.days as number) || 1;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const rows = await db.select({ title: expenses.title, amount: expenses.amount, date: expenses.date, notes: expenses.notes })
      .from(expenses)
      .where(and(eq(expenses.familyId, ctx.familyId), gte(expenses.date, since)))
      .orderBy(desc(expenses.date))
      .limit(30);

    if (!rows.length) return `Nessuna spesa registrata ${days === 1 ? "oggi" : `negli ultimi ${days} giorni`}.`;

    const total = rows.reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
    const list = rows.map(e => {
      const d = new Date(e.date!).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
      return `- ${e.title}: ${Number(e.amount).toFixed(2)}€ (${d})`;
    }).join("\n");

    return `${list}\n\n💰 Totale: ${total.toFixed(2)}€`;
  },
};

// ── Main executor ────────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const executor = executors[toolName];
  if (!executor) return `❌ Strumento "${toolName}" non trovato.`;

  try {
    return await executor(toolInput, ctx);
  } catch (err: any) {
    console.error(`[AI Tool] Error executing ${toolName}:`, err);
    return `❌ Errore nell'esecuzione di "${toolName}": ${err.message}`;
  }
}
