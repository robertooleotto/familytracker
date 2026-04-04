import type { Express, Request, Response } from "express";
import { auth } from "../lib/routeHelpers";
import { storage } from "../storage";
import { db } from "../db";
import { trips, profiles, checkins } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export function registerMiscRoutes(app: Express): void {
  // ─── TRIPS ────────────────────────────────────────────────────────────────
  app.get("/api/trips", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const rows = await db
        .select({ trip: trips, profile: { id: profiles.id, name: profiles.name, colorHex: profiles.colorHex, role: profiles.role } })
        .from(trips)
        .innerJoin(profiles, eq(trips.profileId, profiles.id))
        .where(eq(trips.familyId, a.familyId))
        .orderBy(desc(trips.startedAt))
        .limit(50);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/trips", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { fromName, toName, fromLat, fromLng, toLat, toLng, distanceKm, durationMin, mode, note, startedAt, endedAt } = req.body;
      if (!fromName || !toName || !startedAt) return res.status(400).json({ message: "fromName, toName e startedAt obbligatori" });
      const [trip] = await db.insert(trips).values({
        profileId: a.profileId, familyId: a.familyId,
        fromName, toName,
        fromLat: fromLat ?? null, fromLng: fromLng ?? null,
        toLat: toLat ?? null, toLng: toLng ?? null,
        distanceKm: distanceKm ?? null, durationMin: durationMin ?? null,
        mode: mode ?? "car", note: note ?? null,
        startedAt: new Date(startedAt), endedAt: endedAt ? new Date(endedAt) : null,
      }).returning();
      res.json(trip);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/trips/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      await db.delete(trips).where(eq(trips.id, req.params.id) as any);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/trips/memory", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const recentTrips = await db
        .select({ trip: trips, profile: { name: profiles.name } })
        .from(trips)
        .innerJoin(profiles, eq(trips.profileId, profiles.id))
        .where(eq(trips.familyId, a.familyId))
        .orderBy(desc(trips.startedAt))
        .limit(30);

      const recentCheckins = await db
        .select({ checkin: checkins, profile: { name: profiles.name } })
        .from(checkins)
        .innerJoin(profiles, eq(checkins.userId, profiles.id))
        .where(eq(checkins.familyId, a.familyId))
        .orderBy(desc(checkins.createdAt))
        .limit(20);

      const placeCount: Record<string, number> = {};
      recentTrips.forEach((r: any) => {
        placeCount[r.trip.toName] = (placeCount[r.trip.toName] || 0) + 1;
        placeCount[r.trip.fromName] = (placeCount[r.trip.fromName] || 0) + 1;
      });
      recentCheckins.forEach((r: any) => {
        placeCount[r.checkin.placeName] = (placeCount[r.checkin.placeName] || 0) + 1;
      });
      const topPlaces = Object.entries(placeCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      res.json({ trips: recentTrips.slice(0, 10), checkins: recentCheckins.slice(0, 10), topPlaces });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── WEATHER ───────────────────────────────────────────────────────────────
  app.get("/api/weather", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { lat, lng } = req.query;
      if (!lat || !lng) return res.status(400).json({ message: "lat e lng obbligatori" });
      const [weatherRes, geoRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,relativehumidity_2m&hourly=temperature_2m,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto&forecast_days=3`),
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
          headers: { "User-Agent": "FamilyTracker/1.0 (family-coordination-app)" },
        }),
      ]);
      const [weather, geo] = await Promise.all([weatherRes.json(), geoRes.json()]);
      res.json({ weather, location: geo });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
