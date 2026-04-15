import { db } from "./db";
import { families, profiles, events, messages, shoppingItems, medications, homeDeadlines, tasks, rewards } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { logError, logInfo } from "./lib/logger";

async function hashPassword(p: string) { return bcrypt.hash(p, 12); }

export async function seedDatabase() {
  // SECURITY: Prevent seeding in production
  if (process.env.NODE_ENV === "production") {
    logError("[seed] FATAL: seeding disabled in production");
    return;
  }

  try {
    const existing = await db.select().from(families).limit(1);
    if (existing.length > 0) return;

    logInfo("Seeding database...");

    const [family] = await db.insert(families).values({ name: "Famiglia Rossi", inviteCode: "DEMO1234" }).returning();

    const demoHash = await hashPassword("demo123");
    const [mom] = await db.insert(profiles).values({ familyId: family.id, name: "Sarah Rossi", username: "sarah", passwordHash: demoHash, role: "parent", colorHex: "#3B82F6", avatarUrl: null, fcmToken: null, uiMode: "full", locationPaused: false }).returning();
    const [dad] = await db.insert(profiles).values({ familyId: family.id, name: "Marco Rossi", username: "mike", passwordHash: demoHash, role: "parent", colorHex: "#10B981", avatarUrl: null, fcmToken: null, uiMode: "full", locationPaused: false }).returning();
    const [kid] = await db.insert(profiles).values({ familyId: family.id, name: "Emma Rossi", username: "emma", passwordHash: demoHash, role: "child", colorHex: "#F59E0B", avatarUrl: null, fcmToken: null, uiMode: "full", locationPaused: false }).returning();

    const now = new Date();

    await db.insert(events).values([
      { familyId: family.id, title: "Allenamento calcio", description: "Allenamento settimanale di Emma al parco", startAt: new Date(now.getTime() + 2 * 3600000), endAt: new Date(now.getTime() + 4 * 3600000), color: "#F59E0B", reminderMin: 30, assignedTo: [kid.id], createdBy: mom.id },
      { familyId: family.id, title: "Cena in famiglia", description: "Cena mensile dalla nonna", startAt: new Date(now.getTime() + 24 * 3600000), endAt: new Date(now.getTime() + 27 * 3600000), color: "#EF4444", reminderMin: 60, assignedTo: [mom.id, dad.id, kid.id], createdBy: mom.id },
      { familyId: family.id, title: "Colloquio genitori-insegnanti", description: "Riunione annuale alla scuola", startAt: new Date(now.getTime() + 3 * 24 * 3600000), endAt: new Date(now.getTime() + 3 * 24 * 3600000 + 3600000), color: "#8B5CF6", reminderMin: 1440, assignedTo: [mom.id, dad.id], createdBy: mom.id },
    ]);

    await db.insert(messages).values([
      { familyId: family.id, senderId: mom.id, body: "Buongiorno a tutti! Non dimenticate che Emma ha l'allenamento oggi alle 15 🌟", readBy: [mom.id, dad.id] },
      { familyId: family.id, senderId: dad.id, body: "Grazie per il promemoria! La vado a prendere dopo.", readBy: [dad.id, mom.id] },
      { familyId: family.id, senderId: kid.id, body: "Possiamo mangiare la pizza stasera? 🍕", readBy: [kid.id] },
    ]);

    await db.insert(shoppingItems).values([
      { familyId: family.id, name: "Latte", qty: 2, unit: "litri", category: "Dairy", checked: false, addedBy: mom.id, checkedBy: null, sortOrder: 1 },
      { familyId: family.id, name: "Pane", qty: 1, unit: "filone", category: "Bakery", checked: false, addedBy: mom.id, checkedBy: null, sortOrder: 2 },
      { familyId: family.id, name: "Mele", qty: 6, unit: "pz", category: "Produce", checked: true, addedBy: dad.id, checkedBy: dad.id, sortOrder: 3 },
      { familyId: family.id, name: "Pollo", qty: 1, unit: "kg", category: "Meat", checked: false, addedBy: mom.id, checkedBy: null, sortOrder: 4 },
      { familyId: family.id, name: "Succo d'arancia", qty: 1, unit: "litro", category: "Beverages", checked: false, addedBy: kid.id, checkedBy: null, sortOrder: 5 },
    ]);

    await db.insert(medications).values([
      { familyId: family.id, profileId: kid.id, name: "Vitamina D3", dosage: "1000 UI", scheduleTimes: ["08:00"], lastTakenAt: null, active: true, notes: "Con colazione" },
      { familyId: family.id, profileId: mom.id, name: "Ferro", dosage: "30mg", scheduleTimes: ["09:00", "21:00"], lastTakenAt: null, active: true, notes: "Lontano dai pasti" },
    ]);

    await db.insert(homeDeadlines).values([
      { familyId: family.id, title: "Bollo auto Marco", dueDate: new Date(now.getTime() + 15 * 86400000), category: "tax", reminderDaysBefore: 7, notes: "€ 280 circa", completed: false },
      { familyId: family.id, title: "Revisione caldaia", dueDate: new Date(now.getTime() + 45 * 86400000), category: "maintenance", reminderDaysBefore: 14, notes: "Chiamare idraulico", completed: false },
      { familyId: family.id, title: "Assicurazione casa", dueDate: new Date(now.getTime() + 90 * 86400000), category: "insurance", reminderDaysBefore: 30, notes: "Polizza n. 123456", completed: false },
      { familyId: family.id, title: "Internet Fibra", dueDate: new Date(now.getTime() - 3 * 86400000), category: "utility", reminderDaysBefore: 3, notes: "Addebito automatico", completed: false },
    ]);

    const [task1] = await db.insert(tasks).values({ familyId: family.id, assignedTo: kid.id, title: "Riordina la camera", description: "Metti in ordine libri e giocattoli", points: 15, completedAt: null, verifiedBy: null, createdBy: mom.id }).returning();
    await db.insert(tasks).values({ familyId: family.id, assignedTo: kid.id, title: "Porta fuori il cane", description: "Passeggiata mattutina di 20 minuti", points: 10, completedAt: null, verifiedBy: null, createdBy: dad.id });
    await db.insert(tasks).values({ familyId: family.id, assignedTo: kid.id, title: "Fai i compiti", description: "Matematica e italiano", points: 20, completedAt: new Date(now.getTime() - 3600000), verifiedBy: mom.id, createdBy: mom.id });
    await db.insert(rewards).values({ profileId: kid.id, familyId: family.id, pointsTotal: 20, pointsSpent: 0 });

    logInfo("✅ Seed completato! Demo: username=sarah/mike/emma, password=demo123, codice invito=DEMO1234");
  } catch (err) {
    logError("Seed error", { error: err instanceof Error ? err.message : String(err) });
  }
}
