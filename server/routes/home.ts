import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../lib/requireAuth";

export function registerHomeRoutes(app: Express): void {
  // ─── HOME DEADLINES ────────────────────────────────────────────────────────
  app.get("/api/deadlines", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getHomeDeadlines(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/deadlines", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { title, dueDate, category, reminderDaysBefore, notes } = req.body;
      if (!title || !dueDate) return res.status(400).json({ message: "Missing fields" });
      res.json(await storage.createHomeDeadline({ familyId: a.familyId, title, dueDate: new Date(dueDate), category: category || "other", reminderDaysBefore: reminderDaysBefore || 7, notes: notes || null, completed: false }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/deadlines/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { title, dueDate, category, reminderDaysBefore, notes, completed } = req.body;
      const u: Record<string, any> = {};
      if (title !== undefined) u.title = title;
      if (dueDate !== undefined) u.dueDate = new Date(dueDate);
      if (category !== undefined) u.category = category;
      if (reminderDaysBefore !== undefined) u.reminderDaysBefore = reminderDaysBefore;
      if (notes !== undefined) u.notes = notes;
      if (completed !== undefined) u.completed = completed;
      await storage.updateHomeDeadline(req.params.id, a.familyId, u);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/deadlines/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteHomeDeadline(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── HOME CONTACTS ──────────────────────────────────────────────────────────
  app.get("/api/home-contacts", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getHomeContactsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/home-contacts", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, category, phone, email, notes } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const c = await storage.createHomeContact({ familyId: a.familyId, name, category: category || "other", phone: phone || null, email: email || null, notes: notes || null });
      res.json(c);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/home-contacts/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, category, phone, email, notes } = req.body;
      const u: Record<string, any> = {};
      if (name !== undefined) u.name = name;
      if (category !== undefined) u.category = category;
      if (phone !== undefined) u.phone = phone;
      if (email !== undefined) u.email = email;
      if (notes !== undefined) u.notes = notes;
      await storage.updateHomeContact(req.params.id, a.familyId, u); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/home-contacts/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteHomeContact(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── ANNIVERSARIES ──────────────────────────────────────────────────────────
  app.get("/api/anniversaries", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getAnniversariesByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/anniversaries", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { title, date, type, profileId, reminderDaysBefore } = req.body;
      if (!title || !date) return res.status(400).json({ message: "title and date required" });
      const ann = await storage.createAnniversary({ familyId: a.familyId, title, date: new Date(date), type: type || "birthday", profileId: profileId || null, reminderDaysBefore: reminderDaysBefore ? parseInt(reminderDaysBefore) : 3 });
      res.json(ann);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/anniversaries/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { title, date, type, profileId, reminderDaysBefore } = req.body;
      const u: Record<string, any> = {};
      if (title !== undefined) u.title = title;
      if (date !== undefined) u.date = new Date(date);
      if (type !== undefined) u.type = type;
      if (profileId !== undefined) u.profileId = profileId;
      if (reminderDaysBefore !== undefined) u.reminderDaysBefore = reminderDaysBefore;
      await storage.updateAnniversary(req.params.id, a.familyId, u); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/anniversaries/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteAnniversary(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── DINNER ROTATION ────────────────────────────────────────────────────────
  app.get("/api/dinner-rotation", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getDinnerRotationByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.put("/api/dinner-rotation", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { weekday, profileId, meal } = req.body;
      if (weekday === undefined) return res.status(400).json({ message: "weekday required" });
      await storage.upsertDinnerRotation(a.familyId, parseInt(weekday), profileId || null, meal || null);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
