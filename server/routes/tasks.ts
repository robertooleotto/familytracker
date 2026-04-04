import type { Express } from "express";
import { storage } from "../storage";
import { auth } from "../lib/routeHelpers";
import { db } from "../db";
import { tasks, checkins, profileSettings, rewards, profiles } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { callClaude, parseJSON } from "../ai/aiEngine";

export function registerTasksRoutes(app: Express): void {
  // ─── TASKS & REWARDS ───────────────────────────────────────────────────────
  app.get("/api/tasks", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getTasksByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tasks", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { assignedTo, title, description, points, recurrence, dueDate } = req.body;
      if (!title) return res.status(400).json({ message: "Missing title" });
      res.json(await storage.createTask({
        familyId: a.familyId,
        assignedTo: assignedTo || null,
        title,
        description: description || null,
        points: points || 10,
        recurrence: recurrence || "once",
        dueDate: dueDate ? new Date(dueDate) : null,
        completedAt: null,
        verifiedBy: null,
        createdBy: a.profileId,
      }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tasks/:id/claim", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      await db.update(tasks).set({ assignedTo: a.profileId }).where(and(eq(tasks.id, req.params.id), eq(tasks.familyId, a.familyId)));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tasks/ai-suggest", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const [members, existingTasks, evts] = await Promise.all([
        storage.getFamilyMembers(a.familyId),
        storage.getTasksByFamily(a.familyId),
        storage.getEventsByFamily(a.familyId),
      ]);
      const membersCtx = members.map(m => `- ${m.name} (ruolo: ${m.role})`).join("\n");
      const tasksCtx = existingTasks.slice(0, 20).map(t => `"${t.title}" → ${t.assignedTo ? members.find(m => m.id === t.assignedTo)?.name || "N/A" : "aperto"} [${t.recurrence || "once"}]`).join("\n");
      const eventsCtx = evts.slice(0, 10).map(e => `${e.title} (${new Date(e.startAt).toLocaleDateString("it-IT")})`).join("\n");

      const prompt = `Sei l'assistente AI di una famiglia italiana. Analizza la routine familiare e suggerisci 8 compiti domestici intelligenti da assegnare ai membri.

MEMBRI FAMIGLIA:
${membersCtx}

COMPITI ESISTENTI (ultimi):
${tasksCtx || "Nessuno ancora"}

EVENTI IN AGENDA:
${eventsCtx || "Nessuno"}

Genera 8 compiti pratici e realistici per la famiglia italiana. Ogni compito deve avere:
- Frequenza appropriata (daily/weekly/monthly/once)
- Assegnazione intelligente in base al ruolo (genitori→lavori pesanti, figli→compiti leggeri)
- Punti proporzionali all'impegno

Rispondi SOLO con JSON valido, nessun testo aggiuntivo:
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "recurrence": "daily|weekly|monthly|once",
      "suggestedAssigneeName": "nome del membro o null se aperto a tutti",
      "suggestedAssigneeId": "id del membro o null",
      "points": 5-50,
      "reason": "breve motivazione in italiano"
    }
  ]
}

IDs membri per riferimento: ${members.map(m => `${m.name}="${m.id}"`).join(", ")}`;

      const raw = await callClaude(prompt, "task-ai-suggest", 60 * 60 * 1000);
      const parsed = parseJSON(raw);
      res.json(parsed);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tasks/:id/complete", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.completeTask(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tasks/:id/verify", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.verifyTask(req.params.id, a.profileId, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteTask(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/rewards", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getRewards(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── CHECK-INS ─────────────────────────────────────────────────────────────
  app.get("/api/checkins", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getCheckinsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/checkins — check-in volontario con punto gamification
  app.post("/api/checkins", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { placeName, lat, lng, note } = req.body;
      if (!placeName) return res.status(400).json({ message: "placeName obbligatorio" });
      const [checkin] = await db.insert(checkins).values({ userId: payload.profileId, familyId: payload.familyId, placeName, lat: lat || null, lng: lng || null, note: note || null }).returning();

      // Aggiorna streak e punti
      const today = new Date().toISOString().split("T")[0];
      const [settings] = await db.select().from(profileSettings).where(eq(profileSettings.profileId, payload.profileId));
      const lastDate = settings?.lastCheckInDate;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const newStreak = lastDate === yesterday ? (settings?.checkInStreak || 0) + 1 : lastDate === today ? (settings?.checkInStreak || 0) : 1;
      const newTotal = (settings?.checkInTotal || 0) + 1;
      const pointsEarned = newStreak >= 7 ? 20 : newStreak >= 3 ? 15 : 10;

      if (settings) {
        await db.update(profileSettings).set({ checkInStreak: newStreak, checkInTotal: newTotal, lastCheckInDate: today }).where(eq(profileSettings.profileId, payload.profileId));
      } else {
        await db.insert(profileSettings).values({ profileId: payload.profileId, checkInStreak: newStreak, checkInTotal: newTotal, lastCheckInDate: today });
      }

      const [reward] = await db.select().from(rewards).where(eq(rewards.profileId, payload.profileId));
      if (reward) {
        await db.update(rewards).set({ pointsTotal: reward.pointsTotal + pointsEarned }).where(eq(rewards.profileId, payload.profileId));
      } else {
        await db.insert(rewards).values({ profileId: payload.profileId, familyId: payload.familyId, pointsTotal: pointsEarned, pointsSpent: 0 });
      }

      res.json({ checkin, pointsEarned, streak: newStreak, total: newTotal });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/checkins/family — ultimi check-in di tutta la famiglia
  app.get("/api/checkins/family", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select({
        id: checkins.id, userId: checkins.userId, familyId: checkins.familyId,
        placeName: checkins.placeName, lat: checkins.lat, lng: checkins.lng,
        note: checkins.note, createdAt: checkins.createdAt,
        memberName: profiles.name, memberColor: profiles.colorHex,
      })
        .from(checkins)
        .innerJoin(profiles, eq(checkins.userId, profiles.id))
        .where(eq(checkins.familyId, payload.familyId))
        .orderBy(desc(checkins.createdAt))
        .limit(30);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/checkins/mine — miei check-in con streak
  app.get("/api/checkins/mine", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(checkins).where(eq(checkins.userId, payload.profileId)).orderBy(desc(checkins.createdAt)).limit(20);
      const [settings] = await db.select().from(profileSettings).where(eq(profileSettings.profileId, payload.profileId));
      const [reward] = await db.select().from(rewards).where(eq(rewards.profileId, payload.profileId));
      res.json({ checkins: rows, streak: settings?.checkInStreak || 0, total: settings?.checkInTotal || 0, points: reward?.pointsTotal || 0 });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
