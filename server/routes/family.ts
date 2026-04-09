import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { profiles, profileSettings, moodPhotos, locations } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { safe } from "../lib/routeHelpers";
import { broadcastToFamily } from "../wsServer";
import { ObjectStorageService, ObjectNotFoundError } from "../replit_integrations/object_storage/objectStorage";
import { requireAuth } from "../lib/requireAuth";
import { processLocationUpdate } from "../services/placeDetector";

// Object storage service for profile avatars and mood photos
const objStore = new ObjectStorageService();

export function registerFamilyRoutes(app: Express): void {
  // ─── FAMILY BASICS ─────────────────────────────────────────────────────────
  app.get("/api/family", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const family = await storage.getFamilyById(a.familyId);
      if (!family) return res.status(404).json({ message: "Family not found" });
      res.json(family);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/family/members", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const members = await storage.getFamilyMembers(a.familyId);
      res.json(members.map(safe));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/profile", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, colorHex, uiMode } = req.body;
      const updated = await storage.updateProfile(a.profileId, { name, colorHex, uiMode });
      res.json(safe(updated));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── LOCATION CONTROL ──────────────────────────────────────────────────────
  app.post("/api/location/pause", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      await storage.setLocationPaused(a.profileId, true);
      res.json({ ok: true, paused: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/location/resume", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      await storage.setLocationPaused(a.profileId, false);
      res.json({ ok: true, paused: false });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── LOCATIONS ─────────────────────────────────────────────────────────────
  app.post("/api/locations", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { lat, lng, accuracy, speed, isMoving, batteryPct, wifiSsid } = req.body;
      if (lat === undefined || lng === undefined) return res.status(400).json({ message: "Missing coordinates" });
      // Check if paused
      const profile = await storage.getProfileById(a.profileId);
      if (profile?.locationPaused) return res.json({ ok: true, paused: true });
      const loc = await storage.upsertLocation({
        userId: a.profileId,
        familyId: a.familyId,
        lat,
        lng,
        accuracy: accuracy ?? null,
        speed: speed ?? null,
        isMoving: isMoving ?? false,
        batteryPct: batteryPct ?? null,
        wifiSsid: wifiSsid ?? null,
        timestamp: new Date(),
      });
      // Fire-and-forget: process for smart place detection
      processLocationUpdate(a.familyId, a.profileId, lat, lng, isMoving ?? false)
        .catch(err => console.warn("[PlaceDetector] Error:", err.message));
      res.json(loc);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/family/locations", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const members = await storage.getFamilyMembers(a.familyId);
      const locs = await storage.getLatestLocations(a.familyId);
      const result = members.map((m) => ({
        profile: safe(m),
        location: m.locationPaused ? null : locs.find((l) => l.userId === m.id) || null,
        locationPaused: m.locationPaused,
      }));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/sos", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { lat, lng } = req.body;
      if (lat === undefined || lng === undefined) return res.status(400).json({ message: "Missing coordinates" });
      await storage.upsertLocation({
        userId: a.profileId,
        familyId: a.familyId,
        lat,
        lng,
        accuracy: null,
        speed: null,
        isMoving: false,
        batteryPct: null,
        wifiSsid: null,
        timestamp: new Date(),
      });
      const profile = await storage.getProfileById(a.profileId);
      const sosMsg = await storage.createMessage({
        familyId: a.familyId,
        senderId: a.profileId,
        body: `🆘 SOS! ${profile?.name} ha bisogno di aiuto! Posizione condivisa.`,
        readBy: [],
      });
      broadcastToFamily(a.familyId, { type: "sos", message: sosMsg, lat, lng });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── PROFILE SETTINGS & MOOD ────────────────────────────────────────────────
  app.get("/api/profile/settings", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      let [settings] = await db
        .select()
        .from(profileSettings)
        .where(eq(profileSettings.profileId, payload.profileId));
      if (!settings) {
        const [created] = await db
          .insert(profileSettings)
          .values({ profileId: payload.profileId })
          .returning();
        settings = created;
      }
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/profile/mood", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const { mood } = req.body;
      const valid = ["happy", "excited", "sleeping", "focused", "neutral", "sad"];
      if (!valid.includes(mood)) return res.status(400).json({ message: "Invalid mood" });
      const [row] = await db
        .update(profiles)
        .set({ currentMood: mood })
        .where(eq(profiles.id, payload.profileId))
        .returning();
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── MOOD PHOTOS ───────────────────────────────────────────────────────────
  app.get("/api/profile/mood-photos", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const rows = await db
        .select()
        .from(moodPhotos)
        .where(eq(moodPhotos.profileId, payload.profileId));
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/profile/mood-photos/upload-url", requireAuth, async (req, res) => {
    const payload = req.auth!;
    try {
      const { name, size, contentType } = req.body;
      const uploadURL = await objStore.getObjectEntityUploadURL();
      const objectPath = objStore.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/profile/mood-photos", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const { mood, photoBase64, objectPath } = req.body;
      const valid = ["happy", "excited", "sleeping", "focused", "neutral", "sad"];
      if (!valid.includes(mood) || (!photoBase64 && !objectPath))
        return res.status(400).json({ message: "Invalid payload" });
      const updateData: any = { updatedAt: new Date() };
      if (objectPath) {
        updateData.objectPath = objectPath;
        updateData.photoBase64 = null;
      } else {
        updateData.photoBase64 = photoBase64;
        updateData.objectPath = null;
      }

      const [existing] = await db
        .select({ id: moodPhotos.id })
        .from(moodPhotos)
        .where(
          and(
            eq(moodPhotos.profileId, payload.profileId),
            eq(moodPhotos.mood, mood),
          ),
        );
      let row;
      if (existing) {
        [row] = await db
          .update(moodPhotos)
          .set(updateData)
          .where(
            and(
              eq(moodPhotos.profileId, payload.profileId),
              eq(moodPhotos.mood, mood),
            ),
          )
          .returning();
      } else {
        [row] = await db
          .insert(moodPhotos)
          .values({ profileId: payload.profileId, mood, ...updateData })
          .returning();
      }
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/family/mood-photos", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const members = await storage.getFamilyMembers(payload.familyId);
      const memberIds = members.map((m) => m.id);
      const rows =
        memberIds.length > 0
          ? await db
              .select()
              .from(moodPhotos)
              .where(inArray(moodPhotos.profileId, memberIds))
          : [];
      // Return { profileId: { mood: { src, isObjectPath } } }
      const map: Record<string, Record<string, { src: string; isObjectPath: boolean }>> = {};
      for (const r of rows) {
        if (!map[r.profileId]) map[r.profileId] = {};
        if (r.objectPath) {
          map[r.profileId][r.mood] = { src: r.objectPath, isObjectPath: true };
        } else if (r.photoBase64) {
          map[r.profileId][r.mood] = { src: r.photoBase64, isObjectPath: false };
        }
      }
      res.json(map);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/profile/mood-photos/:mood", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      await db
        .delete(moodPhotos)
        .where(
          and(
            eq(moodPhotos.profileId, payload.profileId),
            eq(moodPhotos.mood, req.params.mood),
          ),
        );
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── AVATAR & PHOTOS ───────────────────────────────────────────────────────
  app.post("/api/profile/avatar-upload-url", requireAuth, async (req, res) => {
    const payload = req.auth!;
    try {
      const { name, size, contentType } = req.body;
      const uploadURL = await objStore.getObjectEntityUploadURL();
      const objectPath = objStore.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/photos/:id", requireAuth, async (req, res) => {
    const payload = req.auth!;
    try {
      const fullPath = `/objects/uploads/${req.params.id}`;
      const file = await objStore.getObjectEntityFile(fullPath);
      await objStore.downloadObject(file, res);
    } catch (e: any) {
      if (e instanceof ObjectNotFoundError) return res.status(404).json({ message: "Non trovato" });
      res.status(500).json({ message: e.message });
    }
  });

  // ─── PROFILE SETTINGS (DETAILED) ────────────────────────────────────────────
  app.patch("/api/profile/settings", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const allowed = [
        "schoolModeEnabled",
        "schoolModeFrom",
        "schoolModeTo",
        "schoolModeDays",
        "elderlyTrackingEnabled",
        "nightAlertEnabled",
        "nightAlertFrom",
        "nightAlertTo",
        "safeZonesOnly",
        "caregiverPhone",
        "caregiverName",
        "batteryMode",
      ];
      const updates: Record<string, any> = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }
      updates.updatedAt = new Date();
      const [existing] = await db
        .select({ id: profileSettings.id })
        .from(profileSettings)
        .where(eq(profileSettings.profileId, payload.profileId));
      if (existing) {
        const [row] = await db
          .update(profileSettings)
          .set(updates)
          .where(eq(profileSettings.profileId, payload.profileId))
          .returning();
        res.json(row);
      } else {
        const [row] = await db
          .insert(profileSettings)
          .values({ profileId: payload.profileId, ...updates })
          .returning();
        res.json(row);
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/profile/family-settings", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const members = await db
        .select()
        .from(profiles)
        .where(eq(profiles.familyId, payload.familyId));
      const memberIds = members.map((m) => m.id);
      const allSettings =
        memberIds.length > 0
          ? await db
              .select()
              .from(profileSettings)
              .where(inArray(profileSettings.profileId, memberIds))
          : [];
      const settingsMap = new Map(allSettings.map((s) => [s.profileId, s]));
      const result = members.map((m) => ({
        profile: { id: m.id, name: m.name, role: m.role, colorHex: m.colorHex },
        settings: settingsMap.get(m.id) || null,
      }));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
