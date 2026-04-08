import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../lib/requireAuth";

export function registerLifestyleRoutes(app: Express): void {
  // ─── PETS ───────────────────────────────────────────────────────────────────
  app.get("/api/pets", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getPetsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/pets", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, species, breed, birthDate, color, vetName, vetPhone, notes } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const pet = await storage.createPet({ familyId: a.familyId, name, species: species || "dog", breed: breed || null, birthDate: birthDate ? new Date(birthDate) : null, color: color || "#F59E0B", vetName: vetName || null, vetPhone: vetPhone || null, notes: notes || null });
      res.json(pet);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/pets/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, species, breed, birthDate, color, vetName, vetPhone, notes } = req.body;
      const u: Record<string, any> = {};
      if (name !== undefined) u.name = name;
      if (species !== undefined) u.species = species;
      if (breed !== undefined) u.breed = breed;
      if (birthDate !== undefined) u.birthDate = birthDate ? new Date(birthDate) : null;
      if (color !== undefined) u.color = color;
      if (vetName !== undefined) u.vetName = vetName;
      if (vetPhone !== undefined) u.vetPhone = vetPhone;
      if (notes !== undefined) u.notes = notes;
      await storage.updatePet(req.params.id, a.familyId, u); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/pets/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deletePet(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/pets/events", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getPetEvents(a.familyId, req.query.petId as string | undefined)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/pets/events", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { petId, type, title, date, nextDueDate, notes } = req.body;
      if (!petId || !title || !date) return res.status(400).json({ message: "petId, title, date required" });
      const ev = await storage.createPetEvent({ familyId: a.familyId, petId, type: type || "checkup", title, date: new Date(date), nextDueDate: nextDueDate ? new Date(nextDueDate) : null, notes: notes || null });
      res.json(ev);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/pets/events/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deletePetEvent(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── VEHICLES ───────────────────────────────────────────────────────────────
  app.get("/api/vehicles", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getVehiclesByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/vehicles", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, brand, model, plate, year, color, currentKm, insuranceExpiry, revisionExpiry, bolloExpiry } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const v = await storage.createVehicle({ familyId: a.familyId, name, brand: brand || null, model: model || null, plate: plate || null, year: year ? parseInt(year) : null, color: color || "#3B82F6", currentKm: currentKm ? parseInt(currentKm) : null, insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null, revisionExpiry: revisionExpiry ? new Date(revisionExpiry) : null, bolloExpiry: bolloExpiry ? new Date(bolloExpiry) : null, currentUserId: null });
      res.json(v);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/vehicles/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const data = { ...req.body };
      if (data.insuranceExpiry) data.insuranceExpiry = new Date(data.insuranceExpiry);
      if (data.revisionExpiry) data.revisionExpiry = new Date(data.revisionExpiry);
      if (data.bolloExpiry) data.bolloExpiry = new Date(data.bolloExpiry);
      await storage.updateVehicle(req.params.id, a.familyId, data);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/vehicles/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteVehicle(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/vehicles/logs", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getVehicleLogs(a.familyId, req.query.vehicleId as string | undefined)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/vehicles/logs", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { vehicleId, type, title, date, amount, km, notes } = req.body;
      if (!vehicleId || !title) return res.status(400).json({ message: "vehicleId and title required" });
      const log = await storage.createVehicleLog({ familyId: a.familyId, vehicleId, type: type || "fuel", title, date: date ? new Date(date) : new Date(), amount: amount ? String(parseFloat(amount)) : null, km: km ? parseInt(km) : null, notes: notes || null });
      res.json(log);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/vehicles/logs/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteVehicleLog(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────
  app.get("/api/subscriptions", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getSubscriptionsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/subscriptions", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, amount, billingCycle, renewalDate, color, icon, active } = req.body;
      if (!name || amount === undefined) return res.status(400).json({ message: "name and amount required" });
      const s = await storage.createSubscription({ familyId: a.familyId, name, amount: String(parseFloat(amount)), billingCycle: billingCycle || "monthly", renewalDate: renewalDate ? new Date(renewalDate) : null, color: color || "#8B5CF6", icon: icon || "tv", active: active !== false });
      res.json(s);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/subscriptions/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, amount, billingCycle, renewalDate, color, icon, active } = req.body;
      const u: Record<string, any> = {};
      if (name !== undefined) u.name = name;
      if (amount !== undefined) u.amount = String(parseFloat(amount));
      if (billingCycle !== undefined) u.billingCycle = billingCycle;
      if (renewalDate !== undefined) u.renewalDate = renewalDate ? new Date(renewalDate) : null;
      if (color !== undefined) u.color = color;
      if (icon !== undefined) u.icon = icon;
      if (active !== undefined) u.active = active;
      await storage.updateSubscription(req.params.id, a.familyId, u); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/subscriptions/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteSubscription(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
