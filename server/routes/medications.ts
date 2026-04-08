import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../lib/requireAuth";

export function registerMedicationsRoutes(app: Express): void {
  app.get("/api/medications", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getMedicationsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/medications", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { profileId, name, dosage, scheduleTimes, notes } = req.body;
      if (!profileId || !name) return res.status(400).json({ message: "Missing fields" });
      res.json(await storage.createMedication({ familyId: a.familyId, profileId, name, dosage: dosage || null, scheduleTimes: Array.isArray(scheduleTimes) ? scheduleTimes : [], lastTakenAt: null, active: true, notes: notes || null }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/medications/:id/taken", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.updateMedication(req.params.id, a.familyId, { lastTakenAt: new Date() }); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/medications/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteMedication(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
