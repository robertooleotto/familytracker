import type { Express } from "express";
import { storage } from "../storage";
import { auth } from "../lib/routeHelpers";

export function registerGeofencesRoutes(app: Express): void {
  app.get("/api/geofences", async (req, res) => {
    const a = await auth(req, res);
    if (!a) return;
    try {
      res.json(await storage.getGeofencesByFamily(a.familyId));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/geofences", async (req, res) => {
    const a = await auth(req, res);
    if (!a) return;
    try {
      const { name, centerLat, centerLng, radiusM, notifyOn, debounceMin } = req.body;
      if (!name || centerLat === undefined || centerLng === undefined)
        return res.status(400).json({ message: "Missing fields" });
      const g = await storage.createGeofence({
        familyId: a.familyId,
        name,
        centerLat,
        centerLng,
        radiusM: radiusM || 200,
        notifyOn: notifyOn || "both",
        debounceMin: debounceMin || 3,
      });
      res.json(g);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/geofences/:id", async (req, res) => {
    const a = await auth(req, res);
    if (!a) return;
    try {
      await storage.deleteGeofence(req.params.id, a.familyId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
