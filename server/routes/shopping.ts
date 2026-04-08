import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "../lib/requireAuth";

export function registerShoppingRoutes(app: Express): void {
  app.get("/api/shopping", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getShoppingItems(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/shopping", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, qty, unit, category } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      res.json(await storage.createShoppingItem({ familyId: a.familyId, name, qty: qty || 1, unit: unit || null, category: category || "Other", checked: false, addedBy: a.profileId, checkedBy: null, sortOrder: 0 }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/shopping/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { checked } = req.body;
      await storage.updateShoppingItem(req.params.id, a.familyId, { checked, ...(checked ? { checkedBy: a.profileId } : {}) });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/shopping/checked/all", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.clearCheckedItems(a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/shopping/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteShoppingItem(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
