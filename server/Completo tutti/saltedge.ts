import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { randomBytes, createHash, createCipheriv, createDecipheriv } from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { ObjectStorageService, ObjectNotFoundError } from "./replit_integrations/object_storage/objectStorage";
import * as tl from "./truelayer";
import * as gc from "./gocardless";
import * as tink from "./tink";
import * as se from "./saltedge";
import * as yap from "./yapily";
import { broadcastToFamily } from "./wsServer";
import { db } from "./db";
import { aiCache, aiInsights, profiles, expenses, shoppingItems, events, subscriptions, schoolConnections, schoolGrades, schoolAbsences, schoolHomework, schoolNotices, profileSettings, checkins, rewards, moodPhotos, locations, medConfirmations } from "@shared/schema";
import { classevivaLogin, classevivaGrades, classevivaAbsences, classevivaHomework, classevivaNotices } from "./school/classeviva";
import { argoLogin, argoGrades, argoAbsences, argoHomework, argoNotices } from "./school/argo";
import { eq, and, desc, inArray, gte } from "drizzle-orm";
import { callClaude, callClaudeVision, parseJSON, getCached, saveInsight } from "./ai/aiEngine";
import { generateEveningSummary } from "./ai/features/eveningSummary";
import { generateSpendingForecast } from "./ai/features/spendingForecast";
import { detectAnomalies } from "./ai/features/anomalyDetector";
import { calculateHealthScore } from "./ai/features/healthScore";
import { generateStudyPlan } from "./ai/features/studyPlanner";
import { suggestShoppingItems } from "./ai/features/shoppingAI";
import { generateMemberNarrative } from "./ai/features/memberNarrative";

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}
const JWT_SECRET = process.env.SESSION_SECRET || "fallback-secret-dev-only";

// Encryption helpers for sensitive fields (school passwords, bank tokens)
const ENCRYPTION_KEY_RAW = (process.env.ENCRYPTION_KEY || JWT_SECRET).padEnd(32, "0").slice(0, 32);
function encryptField(plain: string): string {
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(ENCRYPTION_KEY_RAW), iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
  } catch { return plain; }
}
function decryptField(value: string): string {
  try {
    if (!value.startsWith("enc:")) return value;
    const [, ivHex, encHex, tagHex] = value.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(ENCRYPTION_KEY_RAW), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch { return value; }
}

function sanitize(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

function generateInviteCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Support legacy SHA-256 hashes for smooth migration
  const legacyHash = createHash("sha256").update(password + JWT_SECRET).digest("hex");
  if (hash === legacyHash) return true;
  return bcrypt.compare(password, hash);
}
function generateToken(profileId: string, familyId: string): string {
  return jwt.sign({ profileId, familyId }, JWT_SECRET, { expiresIn: "30d" });
}
function verifyToken(token: string): { profileId: string; familyId: string } | null {
  try { return jwt.verify(token, JWT_SECRET) as any; } catch { return null; }
}
async function auth(req: Request, res: Response): Promise<{ profileId: string; familyId: string } | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return null; }
  const payload = verifyToken(h.slice(7));
  if (!payload) { res.status(401).json({ message: "Invalid token" }); return null; }
  return payload;
}
function safe(p: any) { const { passwordHash, ...rest } = p; return rest; }

// Rate limiters
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ─── CORS + RATE LIMITING ──────────────────────────────────────────────────
  app.use(cors({ origin: true, credentials: true }));
  app.set("trust proxy", 1);
  app.use("/api/auth", authLimiter);
  app.use("/api/ai", aiLimiter);
  app.use("/api", apiLimiter);

  // ─── AUTH ──────────────────────────────────────────────────────────────────
  // Helper: derive a unique username from email or name
  const makeUsername = async (base: string): Promise<string> => {
    const slug = base.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
    let candidate = slug;
    let n = 1;
    while (await storage.getProfileByUsername(candidate)) { candidate = `${slug}${n++}`; }
    return candidate;
  };

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { firstName, lastName, email, password, familyName, role, colorHex } = req.body;
      if (!firstName || !lastName || !email || !password || !familyName)
        return res.status(400).json({ message: "Tutti i campi obbligatori sono richiesti" });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ message: "Indirizzo email non valido" });
      const existing = await storage.getProfileByEmail(email);
      if (existing) return res.status(409).json({ message: "Email già registrata" });
      const username = await makeUsername(email.split("@")[0]);
      const name = `${firstName} ${lastName}`;
      const family = await storage.createFamily({ name: familyName, inviteCode: generateInviteCode() });
      const profile = await storage.createProfile({ name, lastName, email, username, passwordHash: await hashPassword(password), familyId: family.id, role: role || "parent", colorHex: colorHex || "#3B82F6", uiMode: "full", avatarUrl: null, fcmToken: null, locationPaused: false });
      res.json({ profile: safe(profile), token: generateToken(profile.id, family.id) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ message: "Credenziali mancanti" });
      // Accept login by email or username
      let profile = await storage.getProfileByEmail(email);
      if (!profile) profile = await storage.getProfileByUsername(email);
      if (!profile || !(await verifyPassword(password, profile.passwordHash)))
        return res.status(401).json({ message: "Email o password errata" });
      res.json({ profile: safe(profile), token: generateToken(profile.id, profile.familyId) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/auth/join", async (req, res) => {
    try {
      const { firstName, lastName, email, password, inviteCode, role, colorHex } = req.body;
      if (!firstName || !lastName || !password || !inviteCode)
        return res.status(400).json({ message: "Tutti i campi obbligatori sono richiesti" });
      const family = await storage.getFamilyByInviteCode(inviteCode.toUpperCase());
      if (!family) return res.status(404).json({ message: "Codice invito non valido" });
      if (email) {
        const existing = await storage.getProfileByEmail(email);
        if (existing) return res.status(409).json({ message: "Email già registrata" });
      }
      const baseSlug = email ? email.split("@")[0] : `${firstName}${lastName}`;
      const username = await makeUsername(baseSlug);
      const name = `${firstName} ${lastName}`;
      const profile = await storage.createProfile({ name, lastName, email: email || null, username, passwordHash: await hashPassword(password), familyId: family.id, role: role || "child", colorHex: colorHex || "#10B981", uiMode: "full", avatarUrl: null, fcmToken: null, locationPaused: false });
      res.json({ profile: safe(profile), token: generateToken(profile.id, family.id) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── ONBOARDING ────────────────────────────────────────────────────────────
  app.post("/api/onboarding", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const {
        wakeTime, sleepTime, dinnerTime, occupation, whoShops, shoppingFrequency,
        hasPartner, kidsCount, kidsAges, hasPets, petTypes,
        homeType, vehicleCount, recurringDeadlines, activeSubscriptions,
        allergies, dietaryRestrictions, foodDislikes, foodLikes, whoCoooks,
        activities, hasMedications, kidsInSchool, schoolLevels, kidsActivities,
        monthlyBudget, mainExpenseCategories, goals,
      } = req.body;

      // Save food preferences
      if ((allergies?.length || dietaryRestrictions?.length || foodDislikes || foodLikes)) {
        await storage.upsertFoodPreferences(a.familyId, a.profileId, {
          likes: foodLikes ? foodLikes.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          dislikes: foodDislikes ? foodDislikes.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          allergies: allergies || [],
          dietaryRestrictions: dietaryRestrictions || [],
        });
      }

      // Save structured onboarding profile to ai_cache for later use
      const onboardingProfile = {
        wakeTime, sleepTime, dinnerTime, occupation, whoShops, shoppingFrequency,
        hasPartner, kidsCount: kidsCount || 0, kidsAges: kidsAges || [],
        hasPets, petTypes: petTypes || [],
        homeType, vehicleCount: vehicleCount || 0,
        recurringDeadlines: recurringDeadlines || [],
        activeSubscriptions: activeSubscriptions || [],
        foodDislikes, foodLikes,
        whoCoooks, activities: activities || [],
        hasMedications, kidsInSchool,
        schoolLevels: schoolLevels || [], kidsActivities: kidsActivities || [],
        monthlyBudget, mainExpenseCategories: mainExpenseCategories || [],
        goals: goals || [],
        completedAt: new Date().toISOString(),
      };
      const cacheFeature = `onboarding_profile_${a.profileId}`;
      const [existingOb] = await db.select().from(aiCache).where(and(eq(aiCache.familyId, a.familyId), eq(aiCache.feature, cacheFeature)));
      if (existingOb) {
        await db.update(aiCache).set({ resultJson: JSON.stringify(onboardingProfile), generatedAt: new Date() }).where(eq(aiCache.id, existingOb.id));
      } else {
        await db.insert(aiCache).values({ familyId: a.familyId, feature: cacheFeature, resultJson: JSON.stringify(onboardingProfile) });
      }

      // Fetch profile name
      const profileForPrompt = await storage.getProfileById(a.profileId);
      const profileName = profileForPrompt?.name || "questa persona";

      // Generate rich personalized AI insight
      const kidsDesc = (kidsCount || 0) > 0
        ? `${kidsCount} ${(kidsCount || 0) === 1 ? "figlio" : "figli"}${kidsAges?.length ? ` (${kidsAges.join(", ")})` : ""}${kidsInSchool ? ` a scuola (${(schoolLevels || []).join(", ")})` : ""}${kidsActivities?.length ? `, attività: ${kidsActivities.join(", ")}` : ""}`
        : "nessun figlio";

      const prompt = `
Sei l'assistente di fiducia di una famiglia italiana. ${profileName} ha appena completato la configurazione.
Scrivi un messaggio di benvenuto personalizzato in italiano, massimo 4 frasi, tono caldo e familiare.
Menziona 2-3 aspetti specifici della loro vita. NON usare elenchi puntati. Usa un italiano naturale.

Profilo di ${profileName}:
- Orari: sveglia ${wakeTime || "07:00"}, cena ${dinnerTime || "20:00"}, letto ${sleepTime || "23:00"}
- Occupazione: ${occupation || "non specificata"}
- Famiglia: ${hasPartner ? "con partner" : "senza partner"}, ${kidsDesc}
- Animali: ${hasPets ? (petTypes || []).join(", ") || "sì" : "no"}
- Casa: ${homeType || "non specificato"}, ${vehicleCount || 0} veicolo/i
- Scadenze da seguire: ${(recurringDeadlines || []).join(", ") || "nessuna indicata"}
- Abbonamenti: ${(activeSubscriptions || []).join(", ") || "nessuno"}
- Spesa: ${whoShops || "?"}, ${shoppingFrequency || "?"}, cucina: ${whoCoooks || "?"}
- Allergie: ${(allergies || []).join(", ") || "nessuna"}
- Dieta: ${(dietaryRestrictions || []).join(", ") || "nessuna preferenza"}
- Farmaci regolari: ${hasMedications ? "sì" : "no"}
- Sport/hobby: ${(activities || []).join(", ") || "nessuno indicato"}
- Budget mensile: ${monthlyBudget || "non specificato"}
- Principali spese: ${(mainExpenseCategories || []).join(", ") || "non specificate"}
- Vuole migliorare: ${(goals || []).join(", ") || "non specificato"}
      `.trim();

      const insight = await callClaude(prompt, 300);

      if (insight) {
        await saveInsight(a.familyId, "onboarding_welcome", insight, "info");
      }

      // Mark onboarding as completed
      await db.update(profiles)
        .set({ onboardingCompleted: true } as any)
        .where(eq(profiles.id, a.profileId));

      const updatedProfile = await storage.getProfileById(a.profileId);
      res.json({ profile: updatedProfile ? safe(updatedProfile) : null, insight });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── FAMILY ────────────────────────────────────────────────────────────────
  app.get("/api/family", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const family = await storage.getFamilyById(a.familyId);
      if (!family) return res.status(404).json({ message: "Family not found" });
      res.json(family);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/family/members", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const members = await storage.getFamilyMembers(a.familyId);
      res.json(members.map(safe));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/profile", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, colorHex, uiMode } = req.body;
      const updated = await storage.updateProfile(a.profileId, { name, colorHex, uiMode });
      res.json(safe(updated));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/location/pause", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      await storage.setLocationPaused(a.profileId, true);
      res.json({ ok: true, paused: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/location/resume", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      await storage.setLocationPaused(a.profileId, false);
      res.json({ ok: true, paused: false });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── LOCATIONS ─────────────────────────────────────────────────────────────
  app.post("/api/locations", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { lat, lng, accuracy, speed, isMoving, batteryPct, wifiSsid } = req.body;
      if (lat === undefined || lng === undefined) return res.status(400).json({ message: "Missing coordinates" });
      // Check if paused
      const profile = await storage.getProfileById(a.profileId);
      if (profile?.locationPaused) return res.json({ ok: true, paused: true });
      const loc = await storage.upsertLocation({ userId: a.profileId, familyId: a.familyId, lat, lng, accuracy: accuracy ?? null, speed: speed ?? null, isMoving: isMoving ?? false, batteryPct: batteryPct ?? null, wifiSsid: wifiSsid ?? null, timestamp: new Date() });
      res.json(loc);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/family/locations", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const members = await storage.getFamilyMembers(a.familyId);
      const locs = await storage.getLatestLocations(a.familyId);
      const result = members.map(m => ({
        profile: safe(m),
        location: m.locationPaused ? null : (locs.find(l => l.userId === m.id) || null),
        locationPaused: m.locationPaused,
      }));
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/sos", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { lat, lng } = req.body;
      if (lat === undefined || lng === undefined) return res.status(400).json({ message: "Missing coordinates" });
      await storage.upsertLocation({ userId: a.profileId, familyId: a.familyId, lat, lng, accuracy: null, speed: null, isMoving: false, batteryPct: null, wifiSsid: null, timestamp: new Date() });
      const profile = await storage.getProfileById(a.profileId);
      const sosMsg = await storage.createMessage({ familyId: a.familyId, senderId: a.profileId, body: `🆘 SOS! ${profile?.name} ha bisogno di aiuto! Posizione condivisa.`, readBy: [] });
      broadcastToFamily(a.familyId, { type: "sos", message: sosMsg, lat, lng });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── GEOFENCES ─────────────────────────────────────────────────────────────
  app.get("/api/geofences", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getGeofencesByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/geofences", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, centerLat, centerLng, radiusM, notifyOn, debounceMin } = req.body;
      if (!name || centerLat === undefined || centerLng === undefined) return res.status(400).json({ message: "Missing fields" });
      const g = await storage.createGeofence({ familyId: a.familyId, name, centerLat, centerLng, radiusM: radiusM || 200, notifyOn: notifyOn || "both", debounceMin: debounceMin || 3 });
      res.json(g);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/geofences/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteGeofence(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── EVENTS ────────────────────────────────────────────────────────────────
  app.get("/api/events", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getEventsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/events", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { title, description, startAt, endAt, color, reminderMin, assignedTo, category } = req.body;
      if (!title || !startAt) return res.status(400).json({ message: "Missing required fields" });
      const e = await storage.createEvent({ familyId: a.familyId, title, description: description || null, startAt: new Date(startAt), endAt: endAt ? new Date(endAt) : null, color: color || "#3B82F6", reminderMin: reminderMin ?? 30, assignedTo: Array.isArray(assignedTo) ? assignedTo : [], category: category || "other", createdBy: a.profileId });
      res.json(e);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/events/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteEvent(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/events/:id/pickup", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const e = await storage.confirmPickup(req.params.id, a.familyId, a.profileId);
      res.json(e);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── MESSAGES ──────────────────────────────────────────────────────────────
  app.get("/api/messages", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getMessagesByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/messages", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ message: "Empty message" });
      const sanitizedBody = sanitize(body.trim());
      if (!sanitizedBody) return res.status(400).json({ message: "Empty message" });
      const m = await storage.createMessage({ familyId: a.familyId, senderId: a.profileId, body: sanitizedBody, readBy: [a.profileId] });
      broadcastToFamily(a.familyId, { type: "new_message", message: m }, a.profileId);
      res.json(m);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/messages/:id/read", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.markMessageRead(req.params.id, a.profileId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── SHOPPING ──────────────────────────────────────────────────────────────
  app.get("/api/shopping", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getShoppingItems(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/shopping", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, qty, unit, category } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      res.json(await storage.createShoppingItem({ familyId: a.familyId, name, qty: qty || 1, unit: unit || null, category: category || "Other", checked: false, addedBy: a.profileId, checkedBy: null, sortOrder: 0 }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/shopping/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { checked } = req.body;
      await storage.updateShoppingItem(req.params.id, a.familyId, { checked, ...(checked ? { checkedBy: a.profileId } : {}) });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/shopping/checked/all", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.clearCheckedItems(a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/shopping/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteShoppingItem(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── MEDICATIONS ───────────────────────────────────────────────────────────
  app.get("/api/medications", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getMedicationsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/medications", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { profileId, name, dosage, scheduleTimes, notes } = req.body;
      if (!profileId || !name) return res.status(400).json({ message: "Missing fields" });
      res.json(await storage.createMedication({ familyId: a.familyId, profileId, name, dosage: dosage || null, scheduleTimes: Array.isArray(scheduleTimes) ? scheduleTimes : [], lastTakenAt: null, active: true, notes: notes || null }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/medications/:id/taken", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      await storage.updateMedication(req.params.id, a.familyId, { lastTakenAt: new Date() });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/medications/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteMedication(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── HOME DEADLINES ────────────────────────────────────────────────────────
  app.get("/api/deadlines", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getHomeDeadlines(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/deadlines", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { title, dueDate, category, reminderDaysBefore, notes } = req.body;
      if (!title || !dueDate) return res.status(400).json({ message: "Missing fields" });
      res.json(await storage.createHomeDeadline({ familyId: a.familyId, title, dueDate: new Date(dueDate), category: category || "other", reminderDaysBefore: reminderDaysBefore || 7, notes: notes || null, completed: false }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/deadlines/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
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

  app.delete("/api/deadlines/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteHomeDeadline(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── TASKS & REWARDS ───────────────────────────────────────────────────────
  app.get("/api/tasks", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getTasksByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tasks", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { assignedTo, title, description, points } = req.body;
      if (!assignedTo || !title) return res.status(400).json({ message: "Missing fields" });
      res.json(await storage.createTask({ familyId: a.familyId, assignedTo, title, description: description || null, points: points || 10, completedAt: null, verifiedBy: null, createdBy: a.profileId }));
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

  // ─── BUDGET CATEGORIES ─────────────────────────────────────────────────────
  app.get("/api/budget/categories", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getBudgetCategories(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/budget/categories", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, budgetAmount, color, icon } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const cat = await storage.createBudgetCategory({
        familyId: a.familyId, name,
        budgetAmount: budgetAmount ?? 0,
        color: color || "#3B82F6",
        icon: icon || "wallet",
      });
      res.json(cat);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/budget/categories/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      await storage.updateBudgetCategory(req.params.id, a.familyId, req.body);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/budget/categories/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteBudgetCategory(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── EXPENSES ──────────────────────────────────────────────────────────────
  app.get("/api/budget/expenses", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const all = await storage.getExpensesByFamily(a.familyId, from, to);
      res.json(all.slice(offset, offset + limit));
    }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/budget/expenses", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { title, amount, categoryId, date, notes } = req.body;
      if (!title || amount === undefined) return res.status(400).json({ message: "Title and amount required" });
      const expense = await storage.createExpense({
        familyId: a.familyId, title, amount: parseFloat(amount),
        categoryId: categoryId || null,
        date: date ? new Date(date) : new Date(),
        addedBy: a.profileId,
        notes: notes || null,
      });
      res.json(expense);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/budget/expenses/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteExpense(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── PETS ───────────────────────────────────────────────────────────────────
  app.get("/api/pets", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getPetsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/pets", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, species, breed, birthDate, color, vetName, vetPhone, notes } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const pet = await storage.createPet({ familyId: a.familyId, name, species: species || "dog", breed: breed || null, birthDate: birthDate ? new Date(birthDate) : null, color: color || "#F59E0B", vetName: vetName || null, vetPhone: vetPhone || null, notes: notes || null });
      res.json(pet);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/pets/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
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
  app.delete("/api/pets/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deletePet(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/pets/events", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getPetEvents(a.familyId, req.query.petId as string | undefined)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/pets/events", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { petId, type, title, date, nextDueDate, notes } = req.body;
      if (!petId || !title || !date) return res.status(400).json({ message: "petId, title, date required" });
      const ev = await storage.createPetEvent({ familyId: a.familyId, petId, type: type || "checkup", title, date: new Date(date), nextDueDate: nextDueDate ? new Date(nextDueDate) : null, notes: notes || null });
      res.json(ev);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/pets/events/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deletePetEvent(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── VEHICLES ───────────────────────────────────────────────────────────────
  app.get("/api/vehicles", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getVehiclesByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/vehicles", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, brand, model, plate, year, color, currentKm, insuranceExpiry, revisionExpiry, bolloExpiry } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const v = await storage.createVehicle({ familyId: a.familyId, name, brand: brand || null, model: model || null, plate: plate || null, year: year ? parseInt(year) : null, color: color || "#3B82F6", currentKm: currentKm ? parseInt(currentKm) : null, insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null, revisionExpiry: revisionExpiry ? new Date(revisionExpiry) : null, bolloExpiry: bolloExpiry ? new Date(bolloExpiry) : null, currentUserId: null });
      res.json(v);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/vehicles/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const data = { ...req.body };
      if (data.insuranceExpiry) data.insuranceExpiry = new Date(data.insuranceExpiry);
      if (data.revisionExpiry) data.revisionExpiry = new Date(data.revisionExpiry);
      if (data.bolloExpiry) data.bolloExpiry = new Date(data.bolloExpiry);
      await storage.updateVehicle(req.params.id, a.familyId, data);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/vehicles/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteVehicle(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/vehicles/logs", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getVehicleLogs(a.familyId, req.query.vehicleId as string | undefined)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/vehicles/logs", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { vehicleId, type, title, date, amount, km, notes } = req.body;
      if (!vehicleId || !title) return res.status(400).json({ message: "vehicleId and title required" });
      const log = await storage.createVehicleLog({ familyId: a.familyId, vehicleId, type: type || "fuel", title, date: date ? new Date(date) : new Date(), amount: amount ? parseFloat(amount) : null, km: km ? parseInt(km) : null, notes: notes || null });
      res.json(log);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/vehicles/logs/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteVehicleLog(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── SUBSCRIPTIONS ──────────────────────────────────────────────────────────
  app.get("/api/subscriptions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getSubscriptionsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/subscriptions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, amount, billingCycle, renewalDate, color, icon, active } = req.body;
      if (!name || amount === undefined) return res.status(400).json({ message: "name and amount required" });
      const s = await storage.createSubscription({ familyId: a.familyId, name, amount: parseFloat(amount), billingCycle: billingCycle || "monthly", renewalDate: renewalDate ? new Date(renewalDate) : null, color: color || "#8B5CF6", icon: icon || "tv", active: active !== false });
      res.json(s);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/subscriptions/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, amount, billingCycle, renewalDate, color, icon, active } = req.body;
      const u: Record<string, any> = {};
      if (name !== undefined) u.name = name;
      if (amount !== undefined) u.amount = parseFloat(amount);
      if (billingCycle !== undefined) u.billingCycle = billingCycle;
      if (renewalDate !== undefined) u.renewalDate = renewalDate ? new Date(renewalDate) : null;
      if (color !== undefined) u.color = color;
      if (icon !== undefined) u.icon = icon;
      if (active !== undefined) u.active = active;
      await storage.updateSubscription(req.params.id, a.familyId, u); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/subscriptions/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteSubscription(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── HOME CONTACTS ──────────────────────────────────────────────────────────
  app.get("/api/home-contacts", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getHomeContactsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/home-contacts", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, category, phone, email, notes } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const c = await storage.createHomeContact({ familyId: a.familyId, name, category: category || "other", phone: phone || null, email: email || null, notes: notes || null });
      res.json(c);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/home-contacts/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
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
  app.delete("/api/home-contacts/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteHomeContact(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── ANNIVERSARIES ──────────────────────────────────────────────────────────
  app.get("/api/anniversaries", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getAnniversariesByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/anniversaries", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { title, date, type, profileId, reminderDaysBefore } = req.body;
      if (!title || !date) return res.status(400).json({ message: "title and date required" });
      const ann = await storage.createAnniversary({ familyId: a.familyId, title, date: new Date(date), type: type || "birthday", profileId: profileId || null, reminderDaysBefore: reminderDaysBefore ? parseInt(reminderDaysBefore) : 3 });
      res.json(ann);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/anniversaries/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
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
  app.delete("/api/anniversaries/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteAnniversary(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── DINNER ROTATION ────────────────────────────────────────────────────────
  app.get("/api/dinner-rotation", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getDinnerRotationByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.put("/api/dinner-rotation", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { weekday, profileId, meal } = req.body;
      if (weekday === undefined) return res.status(400).json({ message: "weekday required" });
      await storage.upsertDinnerRotation(a.familyId, parseInt(weekday), profileId || null, meal || null);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── BANKING (Open Banking / TrueLayer) ──────────────────────────────────────
  // Helper: get a valid access token for a connection, refreshing if needed
  async function getValidToken(conn: any, familyId: string): Promise<string> {
    if (!conn.accessToken) throw new Error("No access token stored");
    const accessToken = decryptField(conn.accessToken);
    const refreshTk = conn.refreshToken ? decryptField(conn.refreshToken) : null;
    const now = new Date();
    const expiry = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
    if (!expiry || expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
      if (!refreshTk) throw new Error("No refresh token available");
      const tokens = await tl.refreshAccessToken(refreshTk);
      await storage.updateBankConnection(conn.id, familyId, {
        accessToken: encryptField(tokens.accessToken),
        refreshToken: encryptField(tokens.refreshToken),
        tokenExpiresAt: tokens.expiresAt,
      });
      return tokens.accessToken;
    }
    return accessToken;
  }

  app.get("/api/banking/status", async (_req, res) => {
    const customUri = process.env.TRUELAYER_REDIRECT_URI;
    res.json({
      truelayer: { configured: tl.isConfigured() },
      gocardless: { configured: gc.isConfigured() },
      tink: { configured: tink.isConfigured() },
      saltedge: { configured: se.isConfigured() },
      yapily: { configured: yap.isConfigured() },
      configured: tl.isConfigured() || gc.isConfigured() || tink.isConfigured() || se.isConfigured() || yap.isConfigured(),
      providers: [
        ...(tink.isConfigured() ? ["tink"] : []),
        ...(se.isConfigured() ? ["saltedge"] : []),
        ...(yap.isConfigured() ? ["yapily"] : []),
        ...(gc.isConfigured() ? ["gocardless"] : []),
        ...(tl.isConfigured() ? ["truelayer"] : []),
      ],
      environment: process.env.TRUELAYER_ENVIRONMENT || "production",
      redirectUri: customUri || null,
      needsManualPaste: !customUri && !tink.isConfigured() && !se.isConfigured() && !yap.isConfigured(),
    });
  });

  // ─── UNIFIED BANK SEARCH & CONNECT ──────────────────────────────────────────
  // The user searches for their bank → we find which providers cover it → auto-route

  // In-memory cache for provider bank lists (refreshed every 2h)
  let banksCacheTime = 0;
  let banksCache: { id: string; name: string; logo: string | null; country: string; provider: string; providerBankId: string }[] = [];

  // Built-in catalog of major Italian banks with all supported providers
  // Tink: Tink Link handles bank selection UI internally — providerBankId is just a hint
  // Salt Edge: providerCode is optional — Salt Edge widget shows bank picker if omitted
  // Yapily: needs real institutionId — we include known ones, dynamic API adds the rest
  const IT_BANKS_CATALOG: { name: string; logo: string | null; tinkId?: string; seCode?: string; yapId?: string }[] = [
    { name: "Intesa Sanpaolo", logo: "https://cdn.nordigen.com/ais/INTESA_SANPAOLO_BCITITMM.png", tinkId: "it-intesasanpaolo-ob", seCode: "intesa_sanpaolo_xz", yapId: "intesa-sanpaolo-it" },
    { name: "UniCredit", logo: "https://cdn.nordigen.com/ais/UNICREDIT_UNCRITMM.png", tinkId: "it-unicredit-ob", seCode: "unicredit_it", yapId: "unicredit-it" },
    { name: "BNL - BNP Paribas", logo: "https://cdn.nordigen.com/ais/BNL_BNLIITRR.png", tinkId: "it-bnl-ob", seCode: "bnl_it", yapId: "bnl-it" },
    { name: "Poste Italiane - BancoPosta", logo: "https://cdn.nordigen.com/ais/POSTE_ITALIANE_BPPIITRRXXX.png", tinkId: "it-posteitaliane-ob", seCode: "poste_italiane_it", yapId: "poste-italiane-it" },
    { name: "Fineco Bank", logo: "https://cdn.nordigen.com/ais/FINECO_FEBIITM2.png", tinkId: "it-fineco-ob", seCode: "finecobank_it", yapId: "fineco-it" },
    { name: "Banca Mediolanum", logo: "https://cdn.nordigen.com/ais/BANCA_MEDIOLANUM_MEDBITMMXXX.png", tinkId: "it-mediolanum-ob", seCode: "mediolanum_it" },
    { name: "BPER Banca", logo: "https://cdn.nordigen.com/ais/BPER_BANCA_BPMOIT22.png", tinkId: "it-bper-ob", seCode: "bper_banca_it" },
    { name: "Banco BPM", logo: "https://cdn.nordigen.com/ais/BANCO_BPM_BAPPIT21.png", tinkId: "it-bancobpm-ob", seCode: "banco_bpm_it" },
    { name: "Banca Sella", logo: "https://cdn.nordigen.com/ais/BANCA_SELLA_SELBIT2B.png", tinkId: "it-sella-ob", seCode: "banca_sella_it" },
    { name: "Crédit Agricole Italia", logo: "https://cdn.nordigen.com/ais/CREDIT_AGRICOLE_CARIIT.png", tinkId: "it-creditagricole-ob", seCode: "credit_agricole_it" },
    { name: "ING Italia", logo: "https://cdn.nordigen.com/ais/ING_INGBITD1.png", tinkId: "it-ing-ob", seCode: "ing_it" },
    { name: "N26", logo: "https://cdn.nordigen.com/ais/N26_NTSBDEB1.png", tinkId: "it-n26-ob", seCode: "n26_de" },
    { name: "Revolut", logo: "https://cdn.nordigen.com/ais/REVOLUT_REVOGB21.png", tinkId: "it-revolut-ob", seCode: "revolut_eu" },
    { name: "Deutsche Bank Italia", logo: null, tinkId: "it-deutschebank-ob", seCode: "deutsche_bank_it" },
    { name: "Monte dei Paschi di Siena", logo: "https://cdn.nordigen.com/ais/MONTE_PASCHI_SIENA_PASCITM1.png", tinkId: "it-mps-ob", seCode: "monte_paschi_siena_it" },
    { name: "Banca Widiba", logo: null, tinkId: "it-widiba-ob", seCode: "widiba_it" },
    { name: "Che Banca!", logo: null, tinkId: "it-chebanca-ob", seCode: "che_banca_it" },
    { name: "Hype", logo: null, tinkId: "it-hype-ob", seCode: "hype_it" },
    { name: "Illimity Bank", logo: null, tinkId: "it-illimity-ob" },
    { name: "Banca Popolare di Sondrio", logo: null, tinkId: "it-popso-ob" },
    { name: "Credito Emiliano (Credem)", logo: null, tinkId: "it-credem-ob", seCode: "credem_it" },
    { name: "WeBank", logo: null, seCode: "webank_it" },
    { name: "Satispay", logo: null, tinkId: "it-satispay-ob" },
    { name: "Wise (TransferWise)", logo: null, tinkId: "it-wise-ob" },
    { name: "Buddybank", logo: null, tinkId: "it-buddybank-ob" },
    { name: "Isybank", logo: null, tinkId: "it-isybank-ob" },
    { name: "BBVA Italia", logo: null, seCode: "bbva_it" },
    { name: "Trade Republic", logo: null, tinkId: "it-traderepublic-ob" },
    { name: "UBI Banca", logo: null, seCode: "ubi_banca_it" },
    { name: "Tinaba", logo: null },
  ];

  // Determine which provider to use for a catalog entry
  function pickBestProvider(entry: typeof IT_BANKS_CATALOG[0]): { provider: string; bankId: string } | null {
    // Priority: Tink (best UX with Tink Link) > Salt Edge > Yapily
    if (tink.isConfigured() && entry.tinkId) return { provider: "tink", bankId: entry.tinkId };
    if (se.isConfigured() && entry.seCode) return { provider: "saltedge", bankId: entry.seCode };
    if (yap.isConfigured() && entry.yapId) return { provider: "yapily", bankId: entry.yapId };
    // Fallback: open provider widget without specific bank
    if (tink.isConfigured()) return { provider: "tink", bankId: "_auto_" };
    if (se.isConfigured()) return { provider: "saltedge", bankId: "_auto_" };
    return null;
  }

  async function loadAllBanks(country: string): Promise<typeof banksCache> {
    const now = Date.now();
    if (banksCache.length > 0 && now - banksCacheTime < 2 * 3600 * 1000) return banksCache;

    const results: typeof banksCache = [];
    const seen = new Map<string, number>();

    // 1. Built-in catalog — picks best available provider per bank
    if (country === "IT") {
      for (const entry of IT_BANKS_CATALOG) {
        const pick = pickBestProvider(entry);
        if (!pick) continue;
        const key = entry.name.toLowerCase().replace(/[^a-z0-9]/g, "");
        seen.set(key, results.length);
        results.push({
          id: `${pick.provider}:${pick.bankId}`,
          name: entry.name,
          logo: entry.logo,
          country: "IT",
          provider: pick.provider,
          providerBankId: pick.bankId,
        });
      }
    }

    // 2. Dynamic fetch from all provider APIs (supplements catalog)
    const [tinkBanks, seBanks, yapBanks, gcBanks] = await Promise.allSettled([
      tink.isConfigured() ? tink.getProviders(country).catch(() => []) : Promise.resolve([]),
      se.isConfigured() ? se.getProviders(country).catch(() => []) : Promise.resolve([]),
      yap.isConfigured() ? yap.getInstitutions(country).catch(() => []) : Promise.resolve([]),
      gc.isConfigured() ? gc.getInstitutions(country).catch(() => []) : Promise.resolve([]),
    ]);

    // Tink dynamic
    if (tinkBanks.status === "fulfilled") {
      for (const b of tinkBanks.value as any[]) {
        const name = b.displayName || b.name || b.financialInstitutionId || "";
        if (!name) continue;
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seen.has(key)) {
          seen.set(key, results.length);
          results.push({ id: `tink:${b.financialInstitutionId || b.name}`, name, logo: b.images?.icon || null, country, provider: "tink", providerBankId: b.financialInstitutionId || b.name });
        }
      }
    }

    // Salt Edge dynamic
    if (seBanks.status === "fulfilled") {
      for (const b of seBanks.value as any[]) {
        const name = b.name || "";
        if (!name) continue;
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seen.has(key)) {
          seen.set(key, results.length);
          results.push({ id: `se:${b.code}`, name, logo: b.logo_url || null, country: b.country_code || country, provider: "saltedge", providerBankId: b.code });
        }
      }
    }

    // Yapily dynamic
    if (yapBanks.status === "fulfilled") {
      for (const b of yapBanks.value as any[]) {
        const name = b.name || "";
        if (!name) continue;
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seen.has(key)) {
          seen.set(key, results.length);
          const logo = b.media?.find((m: any) => m.type === "icon")?.source || b.media?.[0]?.source || null;
          results.push({ id: `yap:${b.id}`, name, logo, country, provider: "yapily", providerBankId: b.id });
        }
      }
    }

    // GoCardless dynamic
    if (gcBanks.status === "fulfilled") {
      for (const b of gcBanks.value as any[]) {
        const name = b.name || "";
        if (!name) continue;
        const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seen.has(key)) {
          seen.set(key, results.length);
          results.push({ id: `gc:${b.id}`, name, logo: b.logo || null, country, provider: "gocardless", providerBankId: b.id });
        }
      }
    }

    results.sort((a, b) => a.name.localeCompare(b.name));
    banksCache = results;
    banksCacheTime = now;
    return results;
  }

  // GET /api/banking/banks?q=intesa&country=IT — unified bank search
  app.get("/api/banking/banks", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const country = (req.query.country as string || "IT").toUpperCase();
      const query = (req.query.q as string || "").toLowerCase().trim();
      const all = await loadAllBanks(country);

      if (!query) {
        // Return all banks (or first 50 if no search)
        return res.json(all.slice(0, 100));
      }

      // Fuzzy search: match start of words, then contains
      const exact: typeof all = [];
      const startsWith: typeof all = [];
      const contains: typeof all = [];

      for (const bank of all) {
        const nameLower = bank.name.toLowerCase();
        if (nameLower === query) { exact.push(bank); }
        else if (nameLower.startsWith(query) || nameLower.split(/\s+/).some(w => w.startsWith(query))) { startsWith.push(bank); }
        else if (nameLower.includes(query)) { contains.push(bank); }
      }

      res.json([...exact, ...startsWith, ...contains].slice(0, 30));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/banking/unified/connect — smart connect: auto-routes to the right provider
  const UNIFIED_REDIRECT = process.env.BANKING_REDIRECT_URI || process.env.TINK_REDIRECT_URI || process.env.SALTEDGE_REDIRECT_URI || process.env.YAPILY_REDIRECT_URI || process.env.TRUELAYER_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN ? 'https://' + process.env.REPLIT_DEV_DOMAIN : 'http://localhost:5000'}`;

  app.post("/api/banking/unified/connect", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { bankId } = req.body; // format: "provider:providerBankId"
      if (!bankId) return res.status(400).json({ message: "bankId obbligatorio (es. tink:INTESA_SANPAOLO)" });

      const [provider, ...rest] = bankId.split(":");
      const providerBankId = rest.join(":");

      if (provider === "tink" && tink.isConfigured()) {
        const state = randomBytes(12).toString("hex");
        const { url } = await tink.createTinkLinkUrl(UNIFIED_REDIRECT, req.body.country || "IT", "it_IT", state);
        const conn = await storage.createBankConnection({
          familyId: a.familyId, profileId: a.profileId, provider: "tink",
          requisitionId: state, institutionId: providerBankId || "tink-link",
          institutionName: "In collegamento…", institutionLogo: null,
          status: "pending", accountIds: [], accessToken: null, refreshToken: null,
          tokenExpiresAt: null, authUrl: url, lastSyncAt: null,
        });
        return res.json({ connectionId: conn.id, authUrl: url, provider: "tink" });
      }

      if (provider === "saltedge" && se.isConfigured()) {
        const customerId = await se.getOrCreateCustomer(`ft-family-${a.familyId}`);
        // If _auto_, open Salt Edge widget without pre-selecting bank
        const seProviderCode = providerBankId === "_auto_" ? undefined : providerBankId;
        const session = await se.createConnectSession(customerId, UNIFIED_REDIRECT, seProviderCode, "IT");
        const conn = await storage.createBankConnection({
          familyId: a.familyId, profileId: a.profileId, provider: "saltedge",
          requisitionId: customerId, institutionId: providerBankId || "saltedge-widget",
          institutionName: "In collegamento…", institutionLogo: null,
          status: "pending", accountIds: [], accessToken: null, refreshToken: null,
          tokenExpiresAt: null, authUrl: session.connect_url, lastSyncAt: null,
        });
        return res.json({ connectionId: conn.id, authUrl: session.connect_url, provider: "saltedge" });
      }

      if (provider === "yapily" && yap.isConfigured()) {
        if (!providerBankId || providerBankId === "_auto_") {
          return res.status(400).json({ message: "Yapily richiede la selezione di una banca specifica." });
        }
        const authResp = await yap.createAuthorization(providerBankId, UNIFIED_REDIRECT, `ft-${a.profileId}`);
        const conn = await storage.createBankConnection({
          familyId: a.familyId, profileId: a.profileId, provider: "yapily",
          requisitionId: authResp.id, institutionId: providerBankId,
          institutionName: "In collegamento…", institutionLogo: null,
          status: "pending", accountIds: [], accessToken: null, refreshToken: null,
          tokenExpiresAt: null, authUrl: authResp.authorisationUrl, lastSyncAt: null,
        });
        return res.json({ connectionId: conn.id, authUrl: authResp.authorisationUrl, provider: "yapily" });
      }

      if (provider === "gocardless" && gc.isConfigured()) {
        const reference = randomBytes(8).toString("hex");
        const requisition = await gc.createRequisition(providerBankId, UNIFIED_REDIRECT, reference);
        const conn = await storage.createBankConnection({
          familyId: a.familyId, profileId: a.profileId, provider: "gocardless",
          requisitionId: requisition.id, institutionId: providerBankId,
          institutionName: "In collegamento…", institutionLogo: null,
          status: "pending", accountIds: [], accessToken: null, refreshToken: null,
          tokenExpiresAt: null, authUrl: requisition.link, lastSyncAt: null,
        });
        return res.json({ connectionId: conn.id, authUrl: requisition.link, provider: "gocardless" });
      }

      return res.status(400).json({ message: `Provider "${provider}" non configurato o non supportato` });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Redirect URI: use env var (production domain) or TrueLayer's pre-approved sandbox page
  const TL_REDIRECT_URI = process.env.TRUELAYER_REDIRECT_URI || "https://console.truelayer.com/redirect-page";

  // Start connect flow: create pending connection, return TrueLayer auth URL
  app.post("/api/banking/connect", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!tl.isConfigured()) return res.status(503).json({ message: "TrueLayer non configurato" });
    try {
      const state = randomBytes(12).toString("hex");
      const authUrl = tl.buildAuthUrl(TL_REDIRECT_URI, state);
      const conn = await storage.createBankConnection({
        familyId: a.familyId,
        profileId: a.profileId,
        requisitionId: state,
        institutionId: "unknown",
        institutionName: "In collegamento…",
        institutionLogo: null,
        status: "pending",
        accountIds: [],
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        authUrl,
        lastSyncAt: null,
      });
      res.json({ connectionId: conn.id, authUrl, state });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // OAuth callback: exchange code for tokens, fetch accounts
  app.post("/api/banking/callback", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!tl.isConfigured()) return res.status(503).json({ message: "TrueLayer non configurato" });
    try {
      const { code, state } = req.body;
      if (!code || !state) return res.status(400).json({ message: "code e state obbligatori" });
      // Find matching pending connection by state (stored as requisitionId)
      const conn = await storage.getBankConnectionByRequisition(state);
      if (!conn || conn.familyId !== a.familyId) return res.status(404).json({ message: "Connessione non trovata" });
      // Exchange code for tokens — must use same redirect_uri as auth URL
      const tokens = await tl.exchangeCode(code, TL_REDIRECT_URI);
      // Fetch accounts to populate institution info and account IDs
      const accounts = await tl.getAccounts(tokens.accessToken);
      const accountIds = accounts.map(ac => ac.account_id);
      const provider = accounts[0]?.provider;
      const institutionName = provider?.display_name || "Banca collegata";
      const institutionLogo = provider?.logo_uri || null;
      const institutionId = provider?.provider_id || "unknown";
      await storage.updateBankConnection(conn.id, a.familyId, {
        status: "linked",
        accessToken: encryptField(tokens.accessToken),
        refreshToken: encryptField(tokens.refreshToken),
        tokenExpiresAt: tokens.expiresAt,
        accountIds,
        institutionId,
        institutionName,
        institutionLogo,
        lastSyncAt: new Date(),
      });
      res.json({ ok: true, institutionName, accountCount: accountIds.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/banking/connections", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const conns = await storage.getBankConnectionsByFamily(a.familyId);
      // Strip tokens from response for security
      res.json(conns.map(({ accessToken, refreshToken, ...safe }) => safe));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/banking/connections/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const conns = await storage.getBankConnectionsByFamily(a.familyId);
      const conn = conns.find(c => c.id === req.params.id);
      if (conn) {
        if (conn.accessToken) { try { await tl.deleteConnection(decryptField(conn.accessToken)); } catch {} }
        await storage.deleteBankConnection(conn.id, a.familyId);
      }
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/banking/balances", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!tl.isConfigured()) return res.status(503).json({ message: "TrueLayer non configurato" });
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const connections = allConns.filter(c => c.status === "linked");
      const results: any[] = [];
      for (const conn of connections) {
        try {
          const token = await getValidToken(conn, a.familyId);
          const accounts = await tl.getAccounts(token);
          for (const acc of accounts) {
            const balance = await tl.getAccountBalance(acc.account_id, token);
            results.push({
              accountId: acc.account_id,
              connectionId: conn.id,
              institutionName: acc.provider?.display_name || conn.institutionName,
              institutionLogo: acc.provider?.logo_uri || conn.institutionLogo,
              iban: acc.account_number?.iban ?? null,
              name: acc.display_name,
              amount: balance?.available ?? balance?.current ?? null,
              currency: acc.currency || "EUR",
            });
          }
        } catch {}
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/banking/transactions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!tl.isConfigured()) return res.status(503).json({ message: "TrueLayer non configurato" });
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const connections = allConns.filter(c => c.status === "linked");
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const allTx: any[] = [];
      for (const conn of connections) {
        try {
          const token = await getValidToken(conn, a.familyId);
          const accounts = await tl.getAccounts(token);
          for (const acc of accounts) {
            const txs = await tl.getAccountTransactions(acc.account_id, token, dateFrom, dateTo);
            const mapped = txs.map(t => ({
              id: t.transaction_id || `${acc.account_id}-${t.timestamp}-${t.amount}`,
              accountId: acc.account_id,
              connectionId: conn.id,
              institutionName: acc.provider?.display_name || conn.institutionName,
              institutionLogo: acc.provider?.logo_uri || conn.institutionLogo,
              amount: t.amount,
              currency: t.currency,
              description: t.description || t.merchant_name || "Movimento",
              counterparty: t.merchant_name ?? null,
              date: t.timestamp.slice(0, 10),
              category: t.transaction_category,
              type: t.transaction_type,
            }));
            allTx.push(...mapped);
          }
        } catch {}
      }
      allTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(allTx);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── GOCARDLESS / NORDIGEN (PSD2 — 2400+ European banks) ─────────────────

  // GET /api/banking/gc/institutions?country=IT — list available banks
  app.get("/api/banking/gc/institutions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!gc.isConfigured()) return res.status(503).json({ message: "GoCardless non configurato. Imposta GOCARDLESS_SECRET_ID e GOCARDLESS_SECRET_KEY." });
    try {
      const country = (req.query.country as string || "IT").toUpperCase();
      const institutions = await gc.getInstitutions(country);
      res.json(institutions);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/banking/gc/connect — start GoCardless connection for a specific bank
  const GC_REDIRECT_URI = process.env.GOCARDLESS_REDIRECT_URI || process.env.TRUELAYER_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN ? 'https://' + process.env.REPLIT_DEV_DOMAIN : 'http://localhost:5000'}`;
  app.post("/api/banking/gc/connect", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!gc.isConfigured()) return res.status(503).json({ message: "GoCardless non configurato" });
    try {
      const { institutionId } = req.body;
      if (!institutionId) return res.status(400).json({ message: "institutionId obbligatorio" });
      const reference = randomBytes(8).toString("hex");
      const requisition = await gc.createRequisition(institutionId, GC_REDIRECT_URI, reference);
      const conn = await storage.createBankConnection({
        familyId: a.familyId,
        profileId: a.profileId,
        provider: "gocardless",
        requisitionId: requisition.id,
        institutionId,
        institutionName: "In collegamento…",
        institutionLogo: null,
        status: "pending",
        accountIds: [],
        accessToken: null,
        refreshToken: null,
        tokenExpiresAt: null,
        authUrl: requisition.link,
        lastSyncAt: null,
      });
      res.json({ connectionId: conn.id, authUrl: requisition.link, requisitionId: requisition.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/banking/gc/callback — finalize GoCardless connection (check requisition status)
  app.post("/api/banking/gc/callback", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!gc.isConfigured()) return res.status(503).json({ message: "GoCardless non configurato" });
    try {
      const { connectionId } = req.body;
      if (!connectionId) return res.status(400).json({ message: "connectionId obbligatorio" });
      const conns = await storage.getBankConnectionsByFamily(a.familyId);
      const conn = conns.find(c => c.id === connectionId);
      if (!conn || conn.provider !== "gocardless") return res.status(404).json({ message: "Connessione non trovata" });
      // Check requisition status on GoCardless
      const req2 = await gc.getRequisition(conn.requisitionId);
      if (req2.status !== "LN" && req2.accounts.length === 0) {
        return res.json({ ok: false, status: req2.status, message: "Autorizzazione non completata. Riprova." });
      }
      // Fetch account details for each linked account
      const accountIds = req2.accounts;
      let institutionName = "Banca collegata";
      let institutionLogo: string | null = null;
      if (accountIds.length > 0) {
        try {
          const details = await gc.getAccountDetails(accountIds[0]);
          institutionName = details.name || details.ownerName || institutionName;
        } catch {}
      }
      // Try to get institution info
      try {
        const instList = await gc.getInstitutions("IT");
        const inst = instList.find(i => i.id === conn.institutionId);
        if (inst) { institutionName = inst.name; institutionLogo = inst.logo; }
      } catch {}
      await storage.updateBankConnection(conn.id, a.familyId, {
        status: "linked",
        accountIds,
        institutionName,
        institutionLogo,
        lastSyncAt: new Date(),
      });
      res.json({ ok: true, institutionName, accountCount: accountIds.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/banking/gc/balances — balances from GoCardless connections
  app.get("/api/banking/gc/balances", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!gc.isConfigured()) return res.json([]);
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const gcConns = allConns.filter(c => c.provider === "gocardless" && c.status === "linked");
      const results: any[] = [];
      for (const conn of gcConns) {
        for (const accId of conn.accountIds) {
          try {
            const [details, balances] = await Promise.all([
              gc.getAccountDetails(accId),
              gc.getAccountBalances(accId),
            ]);
            const bal = balances.find(b => b.balanceType === "closingBooked" || b.balanceType === "expected") || balances[0];
            results.push({
              accountId: accId,
              connectionId: conn.id,
              provider: "gocardless",
              institutionName: conn.institutionName,
              institutionLogo: conn.institutionLogo,
              iban: details.iban || null,
              name: details.name || details.ownerName || "Conto",
              amount: bal ? parseFloat(bal.balanceAmount.amount) : null,
              currency: bal?.balanceAmount.currency || details.currency || "EUR",
            });
          } catch {}
        }
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/banking/gc/transactions — transactions from GoCardless
  app.get("/api/banking/gc/transactions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!gc.isConfigured()) return res.json([]);
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const gcConns = allConns.filter(c => c.provider === "gocardless" && c.status === "linked");
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const allTx: any[] = [];
      for (const conn of gcConns) {
        for (const accId of conn.accountIds) {
          try {
            const txResult = await gc.getAccountTransactions(accId, dateFrom, dateTo);
            const booked = txResult.booked || [];
            allTx.push(...booked.map(t => ({
              id: t.transactionId || t.internalTransactionId || `gc-${accId}-${t.bookingDate}-${t.transactionAmount.amount}`,
              accountId: accId,
              connectionId: conn.id,
              provider: "gocardless",
              institutionName: conn.institutionName,
              institutionLogo: conn.institutionLogo,
              amount: parseFloat(t.transactionAmount.amount),
              currency: t.transactionAmount.currency,
              description: t.remittanceInformationUnstructured || t.creditorName || t.debtorName || "Movimento",
              counterparty: t.creditorName || t.debtorName || null,
              date: t.bookingDate,
              category: t.merchantCategoryCode || null,
              type: parseFloat(t.transactionAmount.amount) >= 0 ? "CREDIT" : "DEBIT",
            })));
          } catch {}
        }
      }
      allTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(allTx);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── TINK (Visa) — 3400+ European banks, free developer signup ──────────
  const TINK_REDIRECT_URI = process.env.TINK_REDIRECT_URI || process.env.TRUELAYER_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN ? 'https://' + process.env.REPLIT_DEV_DOMAIN : 'http://localhost:5000'}`;

  // POST /api/banking/tink/connect — start Tink Link flow
  app.post("/api/banking/tink/connect", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!tink.isConfigured()) return res.status(503).json({ message: "Tink non configurato. Registrati su console.tink.com e imposta TINK_CLIENT_ID e TINK_CLIENT_SECRET." });
    try {
      const state = randomBytes(12).toString("hex");
      const { url } = await tink.createTinkLinkUrl(TINK_REDIRECT_URI, req.body.market || "IT", req.body.locale || "it_IT", state);
      const conn = await storage.createBankConnection({
        familyId: a.familyId, profileId: a.profileId, provider: "tink",
        requisitionId: state, institutionId: "tink", institutionName: "In collegamento (Tink)…",
        institutionLogo: null, status: "pending", accountIds: [],
        accessToken: null, refreshToken: null, tokenExpiresAt: null, authUrl: url, lastSyncAt: null,
      });
      res.json({ connectionId: conn.id, authUrl: url, state });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/banking/tink/callback — exchange Tink authorization code
  app.post("/api/banking/tink/callback", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!tink.isConfigured()) return res.status(503).json({ message: "Tink non configurato" });
    try {
      const { code, connectionId } = req.body;
      if (!code) return res.status(400).json({ message: "code obbligatorio" });
      const tokens = await tink.exchangeCode(code);
      // Fetch accounts to get institution info
      const accounts = await tink.getAccounts(tokens.accessToken);
      const accountIds = accounts.map(a => a.id);
      const firstAcc = accounts[0];
      const instName = firstAcc?.identifiers?.financialInstitution?.name || "Banca (Tink)";
      const instLogo = firstAcc?.identifiers?.financialInstitution?.logo || null;
      // Find the pending connection
      let conn: any;
      if (connectionId) {
        const conns = await storage.getBankConnectionsByFamily(a.familyId);
        conn = conns.find(c => c.id === connectionId);
      }
      if (!conn) {
        const conns = await storage.getBankConnectionsByFamily(a.familyId);
        conn = conns.find(c => c.provider === "tink" && c.status === "pending");
      }
      if (!conn) return res.status(404).json({ message: "Connessione non trovata" });
      await storage.updateBankConnection(conn.id, a.familyId, {
        status: "linked",
        accessToken: encryptField(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptField(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt,
        accountIds, institutionName: instName, institutionLogo: instLogo, lastSyncAt: new Date(),
      });
      res.json({ ok: true, institutionName: instName, accountCount: accountIds.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Helper: get valid Tink token (refresh if needed)
  async function getValidTinkToken(conn: any, familyId: string): Promise<string> {
    if (!conn.accessToken) throw new Error("No Tink access token");
    const accessToken = decryptField(conn.accessToken);
    const now = new Date();
    const expiry = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
    if (!expiry || expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
      const refreshTk = conn.refreshToken ? decryptField(conn.refreshToken) : null;
      if (!refreshTk) throw new Error("No Tink refresh token");
      const tokens = await tink.refreshAccessToken(refreshTk);
      await storage.updateBankConnection(conn.id, familyId, {
        accessToken: encryptField(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encryptField(tokens.refreshToken) : null,
        tokenExpiresAt: tokens.expiresAt,
      });
      return tokens.accessToken;
    }
    return accessToken;
  }

  // GET /api/banking/tink/balances
  app.get("/api/banking/tink/balances", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!tink.isConfigured()) return res.json([]);
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const tinkConns = allConns.filter(c => c.provider === "tink" && c.status === "linked");
      const results: any[] = [];
      for (const conn of tinkConns) {
        try {
          const token = await getValidTinkToken(conn, a.familyId);
          const accounts = await tink.getAccounts(token);
          for (const acc of accounts) {
            const bal = tink.getAccountBalance(acc);
            results.push({
              accountId: acc.id, connectionId: conn.id, provider: "tink",
              institutionName: acc.identifiers?.financialInstitution?.name || conn.institutionName,
              institutionLogo: acc.identifiers?.financialInstitution?.logo || conn.institutionLogo,
              iban: acc.identifiers?.iban?.iban || acc.iban || null,
              name: acc.name || "Conto",
              amount: bal?.amount ?? null, currency: bal?.currency || "EUR",
            });
          }
        } catch {}
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/banking/tink/transactions
  app.get("/api/banking/tink/transactions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!tink.isConfigured()) return res.json([]);
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const tinkConns = allConns.filter(c => c.provider === "tink" && c.status === "linked");
      const allTx: any[] = [];
      for (const conn of tinkConns) {
        try {
          const token = await getValidTinkToken(conn, a.familyId);
          for (const accId of conn.accountIds) {
            const { transactions } = await tink.getTransactions(token, accId);
            for (const t of transactions) {
              const amt = parseInt(t.amount.value.unscaledValue) / Math.pow(10, parseInt(t.amount.value.scale));
              allTx.push({
                id: t.id, accountId: accId, connectionId: conn.id, provider: "tink",
                institutionName: conn.institutionName, institutionLogo: conn.institutionLogo,
                amount: amt, currency: t.amount.currencyCode,
                description: t.descriptions?.display || t.descriptions?.original || "Movimento",
                counterparty: t.merchantInformation?.merchantName || null,
                date: t.dates?.booked || t.dates?.value || "", category: t.merchantInformation?.merchantCategoryCode || null,
                type: amt >= 0 ? "CREDIT" : "DEBIT",
              });
            }
          }
        } catch {}
      }
      allTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(allTx);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── SALT EDGE — 5000+ banks globally, widget embeddabile ────────────────

  const SE_REDIRECT = process.env.SALTEDGE_REDIRECT_URI || process.env.TINK_REDIRECT_URI || process.env.TRUELAYER_REDIRECT_URI || `${process.env.REPLIT_DEV_DOMAIN ? 'https://' + process.env.REPLIT_DEV_DOMAIN : 'http://localhost:5000'}`;

  // GET /api/banking/se/providers?country=IT
  app.get("/api/banking/se/providers", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!se.isConfigured()) return res.status(503).json({ message: "Salt Edge non configurato. Imposta SALTEDGE_APP_ID e SALTEDGE_SECRET." });
    try {
      const country = (req.query.country as string || "IT").toUpperCase();
      res.json(await se.getProviders(country));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/banking/se/connect — start Salt Edge connect session
  app.post("/api/banking/se/connect", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!se.isConfigured()) return res.status(503).json({ message: "Salt Edge non configurato" });
    try {
      const { providerCode } = req.body;
      const customerId = await se.getOrCreateCustomer(`ft-family-${a.familyId}`);
      const session = await se.createConnectSession(customerId, SE_REDIRECT, providerCode || undefined, "IT");
      const conn = await storage.createBankConnection({
        familyId: a.familyId, profileId: a.profileId, provider: "saltedge",
        requisitionId: customerId, institutionId: providerCode || "saltedge",
        institutionName: "In collegamento (Salt Edge)…", institutionLogo: null,
        status: "pending", accountIds: [], accessToken: null, refreshToken: null,
        tokenExpiresAt: null, authUrl: session.connect_url, lastSyncAt: null,
      });
      res.json({ connectionId: conn.id, authUrl: session.connect_url, customerId });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/banking/se/callback — finalize Salt Edge connection
  app.post("/api/banking/se/callback", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!se.isConfigured()) return res.status(503).json({ message: "Salt Edge non configurato" });
    try {
      const { connectionId } = req.body;
      const conns = await storage.getBankConnectionsByFamily(a.familyId);
      const conn = connectionId ? conns.find(c => c.id === connectionId) : conns.find(c => c.provider === "saltedge" && c.status === "pending");
      if (!conn) return res.status(404).json({ message: "Connessione non trovata" });
      const customerId = conn.requisitionId;
      const seConnections = await se.getConnections(customerId);
      const active = seConnections.find(c => c.status === "active");
      if (!active) return res.json({ ok: false, message: "Nessuna connessione attiva trovata. Riprova." });
      const accounts = await se.getAccounts(active.id);
      const accountIds = accounts.map(a => a.id);
      const provider = await se.getProviders("IT").then(list => list.find(p => p.code === active.provider_code)).catch(() => null);
      await storage.updateBankConnection(conn.id, a.familyId, {
        status: "linked", accountIds,
        accessToken: encryptField(active.id),
        institutionId: active.provider_code,
        institutionName: provider?.name || active.provider_name || "Banca (Salt Edge)",
        institutionLogo: provider?.logo_url || null,
        lastSyncAt: new Date(),
      });
      res.json({ ok: true, institutionName: provider?.name || active.provider_name, accountCount: accountIds.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/banking/se/balances
  app.get("/api/banking/se/balances", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!se.isConfigured()) return res.json([]);
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const seConns = allConns.filter(c => c.provider === "saltedge" && c.status === "linked");
      const results: any[] = [];
      for (const conn of seConns) {
        try {
          const seConnId = conn.accessToken ? decryptField(conn.accessToken) : null;
          if (!seConnId) continue;
          const accounts = await se.getAccounts(seConnId);
          for (const acc of accounts) {
            results.push({
              accountId: acc.id, connectionId: conn.id, provider: "saltedge",
              institutionName: conn.institutionName, institutionLogo: conn.institutionLogo,
              iban: acc.extra?.iban || acc.iban || null,
              name: acc.name || "Conto", amount: acc.balance, currency: acc.currency_code,
            });
          }
        } catch {}
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/banking/se/transactions
  app.get("/api/banking/se/transactions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!se.isConfigured()) return res.json([]);
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const seConns = allConns.filter(c => c.provider === "saltedge" && c.status === "linked");
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const allTx: any[] = [];
      for (const conn of seConns) {
        try {
          const seConnId = conn.accessToken ? decryptField(conn.accessToken) : null;
          if (!seConnId) continue;
          for (const accId of conn.accountIds) {
            const txs = await se.getTransactions(seConnId, accId, dateFrom, dateTo);
            allTx.push(...txs.map(t => ({
              id: t.id, accountId: t.account_id, connectionId: conn.id, provider: "saltedge",
              institutionName: conn.institutionName, institutionLogo: conn.institutionLogo,
              amount: t.amount, currency: t.currency_code,
              description: t.description || "Movimento", counterparty: null,
              date: t.made_on, category: t.category || null,
              type: t.amount >= 0 ? "CREDIT" : "DEBIT",
            })));
          }
        } catch {}
      }
      allTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(allTx);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // DELETE /api/banking/se/connections/:id
  app.delete("/api/banking/se/connections/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const conns = await storage.getBankConnectionsByFamily(a.familyId);
      const conn = conns.find(c => c.id === req.params.id && c.provider === "saltedge");
      if (conn?.accessToken) { try { await se.deleteConnection(decryptField(conn.accessToken)); } catch {} }
      if (conn) await storage.deleteBankConnection(conn.id, a.familyId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── YAPILY — 2000+ banks, 19 EU countries, 90-99% IT coverage ──────────

  const YAP_REDIRECT = process.env.YAPILY_REDIRECT_URI || SE_REDIRECT;

  // GET /api/banking/yap/institutions?country=IT
  app.get("/api/banking/yap/institutions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!yap.isConfigured()) return res.status(503).json({ message: "Yapily non configurato. Imposta YAPILY_APP_ID e YAPILY_SECRET." });
    try {
      const country = (req.query.country as string || "IT").toUpperCase();
      const institutions = await yap.getInstitutions(country);
      res.json(institutions.map(i => ({
        id: i.id, name: i.name,
        logo: i.media?.find(m => m.type === "icon")?.source || i.media?.[0]?.source || null,
        countries: i.countries?.map(c => c.countryCode2) || [],
      })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/banking/yap/connect — start Yapily authorization
  app.post("/api/banking/yap/connect", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!yap.isConfigured()) return res.status(503).json({ message: "Yapily non configurato" });
    try {
      const { institutionId } = req.body;
      if (!institutionId) return res.status(400).json({ message: "institutionId obbligatorio" });
      const authResp = await yap.createAuthorization(institutionId, YAP_REDIRECT, `ft-${a.profileId}`);
      const conn = await storage.createBankConnection({
        familyId: a.familyId, profileId: a.profileId, provider: "yapily",
        requisitionId: authResp.id, institutionId,
        institutionName: "In collegamento (Yapily)…", institutionLogo: null,
        status: "pending", accountIds: [], accessToken: null, refreshToken: null,
        tokenExpiresAt: null, authUrl: authResp.authorisationUrl, lastSyncAt: null,
      });
      res.json({ connectionId: conn.id, authUrl: authResp.authorisationUrl });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/banking/yap/callback — finalize Yapily connection
  app.post("/api/banking/yap/callback", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!yap.isConfigured()) return res.status(503).json({ message: "Yapily non configurato" });
    try {
      const { connectionId } = req.body;
      const conns = await storage.getBankConnectionsByFamily(a.familyId);
      const conn = connectionId ? conns.find(c => c.id === connectionId) : conns.find(c => c.provider === "yapily" && c.status === "pending");
      if (!conn) return res.status(404).json({ message: "Connessione non trovata" });
      const consent = await yap.getConsentByAuth(conn.requisitionId);
      if (!consent || consent.status !== "AUTHORIZED") {
        return res.json({ ok: false, message: "Autorizzazione non completata. Riprova." });
      }
      const accounts = await yap.getAccounts(consent.consentToken);
      const accountIds = accounts.map(a => a.id);
      // Get institution info
      let instName = "Banca (Yapily)";
      let instLogo: string | null = null;
      try {
        const instList = await yap.getInstitutions("IT");
        const inst = instList.find(i => i.id === conn.institutionId);
        if (inst) { instName = inst.name; instLogo = inst.media?.find(m => m.type === "icon")?.source || null; }
      } catch {}
      await storage.updateBankConnection(conn.id, a.familyId, {
        status: "linked", accountIds,
        accessToken: encryptField(consent.consentToken),
        refreshToken: encryptField(consent.id),
        institutionName: instName, institutionLogo: instLogo, lastSyncAt: new Date(),
      });
      res.json({ ok: true, institutionName: instName, accountCount: accountIds.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/banking/yap/balances
  app.get("/api/banking/yap/balances", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!yap.isConfigured()) return res.json([]);
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const yapConns = allConns.filter(c => c.provider === "yapily" && c.status === "linked");
      const results: any[] = [];
      for (const conn of yapConns) {
        try {
          const consentToken = conn.accessToken ? decryptField(conn.accessToken) : null;
          if (!consentToken) continue;
          const accounts = await yap.getAccounts(consentToken);
          for (const acc of accounts) {
            const iban = acc.accountIdentifications?.find(id => id.type === "IBAN")?.identification || null;
            const bal = acc.accountBalances?.find(b => b.type === "CLOSING_BOOKED" || b.type === "EXPECTED") || acc.accountBalances?.[0];
            results.push({
              accountId: acc.id, connectionId: conn.id, provider: "yapily",
              institutionName: conn.institutionName, institutionLogo: conn.institutionLogo,
              iban, name: acc.accountNames?.[0]?.name || acc.description || "Conto",
              amount: bal?.balanceAmount?.amount ?? acc.balance ?? null,
              currency: bal?.balanceAmount?.currency || acc.currency || "EUR",
            });
          }
        } catch {}
      }
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/banking/yap/transactions
  app.get("/api/banking/yap/transactions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    if (!yap.isConfigured()) return res.json([]);
    try {
      const allConns = await storage.getBankConnectionsByFamily(a.familyId);
      const yapConns = allConns.filter(c => c.provider === "yapily" && c.status === "linked");
      const dateFrom = req.query.dateFrom as string | undefined;
      const allTx: any[] = [];
      for (const conn of yapConns) {
        try {
          const consentToken = conn.accessToken ? decryptField(conn.accessToken) : null;
          if (!consentToken) continue;
          for (const accId of conn.accountIds) {
            const txs = await yap.getTransactions(consentToken, accId, dateFrom);
            allTx.push(...txs.map(t => ({
              id: t.id || `yap-${accId}-${t.date}-${t.amount}`,
              accountId: accId, connectionId: conn.id, provider: "yapily",
              institutionName: conn.institutionName, institutionLogo: conn.institutionLogo,
              amount: t.amount, currency: t.currency,
              description: t.description || t.transactionInformation || t.reference || "Movimento",
              counterparty: t.merchantName || null,
              date: t.bookingDateTime?.split("T")[0] || t.date,
              category: t.merchantCategoryCode || null,
              type: t.amount >= 0 ? "CREDIT" : "DEBIT",
            })));
          }
        } catch {}
      }
      allTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(allTx);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // DELETE /api/banking/yap/connections/:id
  app.delete("/api/banking/yap/connections/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const conns = await storage.getBankConnectionsByFamily(a.familyId);
      const conn = conns.find(c => c.id === req.params.id && c.provider === "yapily");
      if (conn?.refreshToken) { try { await yap.deleteConsent(decryptField(conn.refreshToken)); } catch {} }
      if (conn) await storage.deleteBankConnection(conn.id, a.familyId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── COMBINED: All 5 providers balances & transactions ──────────────────────

  app.get("/api/banking/all/balances", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const h = { authorization: req.headers.authorization! };
      const base = `${req.protocol}://${req.get("host")}`;
      const [r1, r2, r3, r4, r5] = await Promise.allSettled([
        fetch(`${base}/api/banking/balances`, { headers: h }).then(r => r.json()),
        fetch(`${base}/api/banking/gc/balances`, { headers: h }).then(r => r.json()),
        fetch(`${base}/api/banking/tink/balances`, { headers: h }).then(r => r.json()),
        fetch(`${base}/api/banking/se/balances`, { headers: h }).then(r => r.json()),
        fetch(`${base}/api/banking/yap/balances`, { headers: h }).then(r => r.json()),
      ]);
      const all = [r1, r2, r3, r4, r5].flatMap(r => r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []);
      res.json(all);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/banking/all/transactions", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
      const h = { authorization: req.headers.authorization! };
      const base = `${req.protocol}://${req.get("host")}`;
      const [r1, r2, r3, r4, r5] = await Promise.allSettled([
        fetch(`${base}/api/banking/transactions${qs}`, { headers: h }).then(r => r.json()),
        fetch(`${base}/api/banking/gc/transactions${qs}`, { headers: h }).then(r => r.json()),
        fetch(`${base}/api/banking/tink/transactions${qs}`, { headers: h }).then(r => r.json()),
        fetch(`${base}/api/banking/se/transactions${qs}`, { headers: h }).then(r => r.json()),
        fetch(`${base}/api/banking/yap/transactions${qs}`, { headers: h }).then(r => r.json()),
      ]);
      const all = [r1, r2, r3, r4, r5].flatMap(r => r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [])
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(all);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── ELDERLY SAFETY ROUTES ──────────────────────────────────────────────────

  // ── Vital Signs CRUD ──────────────────────────────────────────────────────
  app.get("/api/elderly/vitals/:profileId", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const type = req.query.type as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(await storage.getVitalSigns(req.params.profileId, type, limit));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/vitals", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { profileId, type, value, value2, unit, notes, measuredAt } = req.body;
      if (!profileId || !type || value === undefined || !unit) return res.status(400).json({ message: "profileId, type, value, unit obbligatori" });
      const vital = await storage.createVitalSign({
        familyId: a.familyId, profileId, type, value: parseFloat(value), value2: value2 ? parseFloat(value2) : null, unit, notes: notes || null,
        measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
      });
      // Check thresholds and create alert if out of range
      const alert = checkVitalThreshold(type, parseFloat(value), value2 ? parseFloat(value2) : null);
      if (alert) {
        await storage.createElderlyAlert({
          familyId: a.familyId, profileId, type: "vital_alert", severity: alert.severity,
          title: alert.title, description: alert.description,
        });
        broadcastToFamily(a.familyId, { type: "elderly_alert", alertType: "vital_alert", profileId, title: alert.title });
      }
      res.json(vital);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/elderly/vitals/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteVitalSign(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Vital sign threshold checker
  function checkVitalThreshold(type: string, value: number, value2: number | null): { severity: string; title: string; description: string } | null {
    switch (type) {
      case "blood_pressure":
        if (value >= 180 || (value2 && value2 >= 120)) return { severity: "critical", title: "Pressione molto alta", description: `Pressione ${value}/${value2 || "?"} mmHg — consultare medico urgentemente` };
        if (value >= 140 || (value2 && value2 >= 90)) return { severity: "warning", title: "Pressione alta", description: `Pressione ${value}/${value2 || "?"} mmHg — fuori range normale` };
        if (value < 90 || (value2 && value2 < 60)) return { severity: "warning", title: "Pressione bassa", description: `Pressione ${value}/${value2 || "?"} mmHg — fuori range normale` };
        break;
      case "blood_sugar":
        if (value > 250) return { severity: "critical", title: "Glicemia molto alta", description: `Glicemia ${value} mg/dl — consultare medico` };
        if (value > 180) return { severity: "warning", title: "Glicemia alta", description: `Glicemia ${value} mg/dl` };
        if (value < 70) return { severity: "warning", title: "Glicemia bassa", description: `Glicemia ${value} mg/dl — ipoglicemia` };
        break;
      case "heart_rate":
        if (value > 120) return { severity: "warning", title: "Battito cardiaco alto", description: `FC ${value} bpm a riposo` };
        if (value < 50) return { severity: "warning", title: "Battito cardiaco basso", description: `FC ${value} bpm — bradicardia` };
        break;
      case "temperature":
        if (value >= 39) return { severity: "critical", title: "Febbre alta", description: `Temperatura ${value}°C` };
        if (value >= 37.5) return { severity: "warning", title: "Febbre", description: `Temperatura ${value}°C` };
        break;
      case "oxygen":
        if (value < 90) return { severity: "critical", title: "Saturazione critica", description: `SpO2 ${value}% — cercare assistenza medica` };
        if (value < 95) return { severity: "warning", title: "Saturazione bassa", description: `SpO2 ${value}%` };
        break;
    }
    return null;
  }

  // ── Daily Check-in ────────────────────────────────────────────────────────
  app.get("/api/elderly/checkin/today", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getTodayCheckin(a.profileId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/checkin", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { status, mood, note } = req.body;
      if (!status) return res.status(400).json({ message: "status obbligatorio (ok | help)" });
      const checkin = await storage.upsertDailyCheckin({
        familyId: a.familyId, profileId: a.profileId, status, mood: mood || null, note: note || null,
      });
      if (status === "help") {
        await storage.createElderlyAlert({
          familyId: a.familyId, profileId: a.profileId, type: "sos", severity: "critical",
          title: "Richiesta aiuto dal check-in", description: note || "L'utente ha segnalato di aver bisogno di aiuto",
        });
        broadcastToFamily(a.familyId, { type: "elderly_alert", alertType: "sos", profileId: a.profileId, title: "Richiesta aiuto!" });
      } else {
        broadcastToFamily(a.familyId, { type: "checkin_ok", profileId: a.profileId });
      }
      res.json(checkin);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/checkin/history/:profileId", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getDailyCheckins(req.params.profileId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Emergency Medical Card ────────────────────────────────────────────────
  app.get("/api/elderly/emergency-card/:profileId", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getEmergencyCard(req.params.profileId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/emergency-cards", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getEmergencyCardsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/emergency-card", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { profileId, fullName, dateOfBirth, bloodType, allergies, conditions, currentMedications, doctorName, doctorPhone,
        emergencyContact1Name, emergencyContact1Phone, emergencyContact1Relation,
        emergencyContact2Name, emergencyContact2Phone, emergencyContact2Relation, insuranceInfo, notes } = req.body;
      if (!profileId || !fullName) return res.status(400).json({ message: "profileId e fullName obbligatori" });
      const card = await storage.upsertEmergencyCard({
        profileId, familyId: a.familyId, fullName, dateOfBirth, bloodType,
        allergies: allergies || [], conditions: conditions || [], currentMedications: currentMedications || [],
        doctorName, doctorPhone,
        emergencyContact1Name, emergencyContact1Phone, emergencyContact1Relation,
        emergencyContact2Name, emergencyContact2Phone, emergencyContact2Relation,
        insuranceInfo, notes,
      });
      res.json(card);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Elderly Alerts ────────────────────────────────────────────────────────
  app.get("/api/elderly/alerts", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getElderlyAlerts(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/alerts/unacknowledged", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getUnacknowledgedAlerts(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/alerts/:id/acknowledge", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.acknowledgeAlert(req.params.id, a.familyId, a.profileId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Medication Confirmations ──────────────────────────────────────────────
  app.get("/api/elderly/meds/today/:profileId", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const today = new Date().toISOString().split("T")[0];
      res.json(await storage.getMedConfirmations(req.params.profileId, today));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/meds/confirm", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { medicationId, scheduledTime, status } = req.body;
      if (!medicationId || !scheduledTime) return res.status(400).json({ message: "medicationId e scheduledTime obbligatori" });
      const today = new Date().toISOString().split("T")[0];
      const conf = await storage.upsertMedConfirmation({
        medicationId, profileId: a.profileId, familyId: a.familyId,
        scheduledDate: today, scheduledTime, status: status || "taken",
      });
      res.json(conf);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Caregiver Dashboard (aggregate data for one elderly profile) ──────────
  app.get("/api/elderly/dashboard/:profileId", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const pid = req.params.profileId;
      const profile = await storage.getProfileById(pid);
      if (!profile || profile.familyId !== a.familyId) return res.status(404).json({ message: "Profilo non trovato" });
      const today = new Date().toISOString().split("T")[0];

      const [todayCheckin, recentCheckins, recentAlerts, unackAlerts, todayMeds, recentVitals, emergencyCard, location, settings] = await Promise.all([
        storage.getTodayCheckin(pid),
        storage.getDailyCheckins(pid, 7),
        storage.getElderlyAlerts(a.familyId, 20).then(all => all.filter(al => al.profileId === pid)),
        storage.getUnacknowledgedAlerts(a.familyId).then(all => all.filter(al => al.profileId === pid)),
        storage.getMedConfirmations(pid, today),
        storage.getVitalSigns(pid, undefined, 20),
        storage.getEmergencyCard(pid),
        db.select().from(locations).where(eq(locations.userId, pid)).then(r => r[0] || null),
        db.select().from(profileSettings).where(eq(profileSettings.profileId, pid)).then(r => r[0] || null),
      ]);

      // Calculate medication adherence (last 7 days)
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const weekMeds = await db.select().from(medConfirmations)
        .where(and(eq(medConfirmations.profileId, pid), gte(medConfirmations.scheduledDate, weekAgo)));
      const medsTaken = weekMeds.filter(m => m.status === "taken").length;
      const medsTotal = weekMeds.length;

      // Status semaphore
      const statuses: Record<string, "green" | "yellow" | "red"> = {};
      statuses.checkin = todayCheckin?.status === "ok" ? "green" : todayCheckin?.status === "help" ? "red" : "yellow";
      statuses.alerts = unackAlerts.length === 0 ? "green" : unackAlerts.some(a => a.severity === "critical") ? "red" : "yellow";
      statuses.medications = medsTotal === 0 ? "green" : medsTaken / medsTotal > 0.8 ? "green" : medsTaken / medsTotal > 0.5 ? "yellow" : "red";
      statuses.location = location ? "green" : "yellow";

      // Latest vitals by type
      const latestVitals: Record<string, any> = {};
      for (const v of recentVitals) { if (!latestVitals[v.type]) latestVitals[v.type] = v; }

      res.json({
        profile: { id: profile.id, name: profile.name, role: profile.role, colorHex: profile.colorHex },
        statuses,
        todayCheckin,
        recentCheckins,
        recentAlerts,
        unackAlerts,
        todayMeds,
        latestVitals,
        medicationAdherence: medsTotal > 0 ? Math.round((medsTaken / medsTotal) * 100) : null,
        emergencyCard,
        location: location ? { lat: location.lat, lng: location.lng, timestamp: location.timestamp, batteryPct: location.batteryPct } : null,
        settings,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── List all elderly members (for caregiver view) ─────────────────────────
  app.get("/api/elderly/members", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getElderlyProfiles(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Fall detection escalation endpoint ────────────────────────────────────
  app.post("/api/elderly/fall-detected", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { lat, lng, impactG } = req.body;
      const profile = await storage.getProfileById(a.profileId);
      const alert = await storage.createElderlyAlert({
        familyId: a.familyId, profileId: a.profileId,
        type: "fall", severity: "critical",
        title: `Possibile caduta rilevata — ${profile?.name || "Utente"}`,
        description: `Impatto ${impactG?.toFixed(1) || "?"} G. Nessuna risposta dopo il countdown.`,
        lat: lat || null, lng: lng || null,
      });
      // Broadcast to all family members
      broadcastToFamily(a.familyId, {
        type: "elderly_alert", alertType: "fall", profileId: a.profileId,
        title: `Caduta rilevata! ${profile?.name || ""}`, lat, lng,
      });
      // Also create SOS message in chat
      await storage.createMessage({
        familyId: a.familyId, senderId: a.profileId,
        body: `🆘 CADUTA RILEVATA! ${profile?.name} potrebbe essere caduto/a. Posizione condivisa. Impatto: ${impactG?.toFixed(1) || "?"} G`,
        readBy: [],
      });
      res.json({ ok: true, alertId: alert.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Inactivity report endpoint (called by client-side check) ──────────────
  app.post("/api/elderly/inactivity-alert", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { minutes } = req.body;
      const profile = await storage.getProfileById(a.profileId);
      const alert = await storage.createElderlyAlert({
        familyId: a.familyId, profileId: a.profileId,
        type: "inactivity", severity: "warning",
        title: `Nessun movimento da ${Math.round(minutes || 0)} minuti — ${profile?.name || "Utente"}`,
        description: "Il telefono non ha registrato movimento significativo.",
      });
      broadcastToFamily(a.familyId, { type: "elderly_alert", alertType: "inactivity", profileId: a.profileId, title: alert.title }, a.profileId);
      res.json({ ok: true, alertId: alert.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── AI ROUTES ────────────────────────────────────────────────────────────────

  // GET /api/ai/status — check if AI is available
  app.get("/api/ai/status", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      res.json({ available: !!process.env.CLAUDE_API_KEY });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/ai/summary — riepilogo serale (cached 12h)
  app.get("/api/ai/summary", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const cached = await getCached(payload.familyId, "evening_summary", 12);
      if (cached) return res.json(cached);
      const fresh = await generateEveningSummary(payload.familyId);
      res.json(fresh ? { text: fresh } : { text: null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/ai/forecast — previsione spese mensili
  app.get("/api/ai/forecast", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await generateSpendingForecast(payload.familyId);
      res.json(result ?? { error: "insufficient_data" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/ai/anomalies — anomalie di spesa
  app.get("/api/ai/anomalies", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await detectAnomalies(payload.familyId);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/ai/score — health score finanziario
  app.get("/api/ai/score", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await calculateHealthScore(payload.familyId);
      res.json(result ?? { score: null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/ai/study/:childId — piano studio
  app.get("/api/ai/study/:childId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await generateStudyPlan(payload.familyId, req.params.childId);
      res.json(result ?? { study_sessions: [] });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/ai/shopping — suggerimenti lista spesa
  app.get("/api/ai/shopping", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await suggestShoppingItems(payload.familyId);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/ai/insights — tutti gli insight recenti (ultimi 20)
  app.get("/api/ai/insights", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.familyId, payload.familyId))
        .orderBy(desc(aiInsights.createdAt))
        .limit(20);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/ai/insights/:id/read — segna insight come letto
  app.post("/api/ai/insights/:id/read", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      await db
        .update(aiInsights)
        .set({ readAt: new Date() })
        .where(and(eq(aiInsights.id, req.params.id), eq(aiInsights.familyId, payload.familyId)));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── PROFILE SETTINGS ─────────────────────────────────────────────────────

  // GET /api/profile/settings
  app.get("/api/profile/settings", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      let [settings] = await db.select().from(profileSettings).where(eq(profileSettings.profileId, payload.profileId));
      if (!settings) {
        const [created] = await db.insert(profileSettings).values({ profileId: payload.profileId }).returning();
        settings = created;
      }
      res.json(settings);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PATCH /api/profile/mood
  app.patch("/api/profile/mood", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { mood } = req.body;
      const valid = ["happy", "excited", "sleeping", "focused", "neutral", "sad"];
      if (!valid.includes(mood)) return res.status(400).json({ message: "Invalid mood" });
      const [row] = await db.update(profiles).set({ currentMood: mood }).where(eq(profiles.id, payload.profileId)).returning();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/profile/mood-photos — all mood photos for the current user
  app.get("/api/profile/mood-photos", async (req, res) => {
    try {
      const payload = await auth(req, res); if (!payload) return;
      const rows = await db.select().from(moodPhotos).where(eq(moodPhotos.profileId, payload.profileId));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/profile/mood-photos/upload-url — presigned URL for mood photo upload
  app.post("/api/profile/mood-photos/upload-url", async (req, res) => {
    const payload = await auth(req, res); if (!payload) return;
    try {
      const { name, size, contentType } = req.body;
      const uploadURL = await objStore.getObjectEntityUploadURL();
      const objectPath = objStore.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/profile/mood-photos — upsert a mood photo (base64 legacy OR objectPath new)
  app.post("/api/profile/mood-photos", async (req, res) => {
    try {
      const payload = await auth(req, res); if (!payload) return;
      const { mood, photoBase64, objectPath } = req.body;
      const valid = ["happy", "excited", "sleeping", "focused", "neutral", "sad"];
      if (!valid.includes(mood) || (!photoBase64 && !objectPath)) return res.status(400).json({ message: "Invalid payload" });
      const updateData: any = { updatedAt: new Date() };
      if (objectPath) { updateData.objectPath = objectPath; updateData.photoBase64 = null; }
      else { updateData.photoBase64 = photoBase64; updateData.objectPath = null; }

      const [existing] = await db.select({ id: moodPhotos.id }).from(moodPhotos)
        .where(and(eq(moodPhotos.profileId, payload.profileId), eq(moodPhotos.mood, mood)));
      let row;
      if (existing) {
        [row] = await db.update(moodPhotos).set(updateData)
          .where(and(eq(moodPhotos.profileId, payload.profileId), eq(moodPhotos.mood, mood))).returning();
      } else {
        [row] = await db.insert(moodPhotos).values({ profileId: payload.profileId, mood, ...updateData }).returning();
      }
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/family/mood-photos — compact map for all family members; returns objectPath or base64
  app.get("/api/family/mood-photos", async (req, res) => {
    try {
      const payload = await auth(req, res); if (!payload) return;
      const members = await storage.getFamilyMembers(payload.familyId);
      const memberIds = members.map(m => m.id);
      const rows = memberIds.length > 0
        ? await db.select().from(moodPhotos).where(inArray(moodPhotos.profileId, memberIds))
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // DELETE /api/profile/mood-photos/:mood — remove a mood photo
  app.delete("/api/profile/mood-photos/:mood", async (req, res) => {
    try {
      const payload = await auth(req, res); if (!payload) return;
      await db.delete(moodPhotos).where(and(eq(moodPhotos.profileId, payload.profileId), eq(moodPhotos.mood, req.params.mood)));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/profile/avatar-upload-url — presigned URL for avatar upload
  app.post("/api/profile/avatar-upload-url", async (req, res) => {
    const payload = await auth(req, res); if (!payload) return;
    try {
      const { name, size, contentType } = req.body;
      const uploadURL = await objStore.getObjectEntityUploadURL();
      const objectPath = objStore.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/photos/:id — serve a file from object storage by UUID id (authenticated)
  app.get("/api/photos/:id", async (req, res) => {
    const payload = await auth(req, res); if (!payload) return;
    try {
      const fullPath = `/objects/uploads/${req.params.id}`;
      const file = await objStore.getObjectEntityFile(fullPath);
      await objStore.downloadObject(file, res);
    } catch (e: any) {
      if (e instanceof ObjectNotFoundError) return res.status(404).json({ message: "Non trovato" });
      res.status(500).json({ message: e.message });
    }
  });

  // PATCH /api/profile/settings
  app.patch("/api/profile/settings", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const allowed = ["schoolModeEnabled", "schoolModeFrom", "schoolModeTo", "schoolModeDays",
        "elderlyTrackingEnabled", "nightAlertEnabled", "nightAlertFrom", "nightAlertTo",
        "safeZonesOnly", "caregiverPhone", "caregiverName", "batteryMode"];
      const updates: Record<string, any> = {};
      for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
      updates.updatedAt = new Date();
      const [existing] = await db.select({ id: profileSettings.id }).from(profileSettings).where(eq(profileSettings.profileId, payload.profileId));
      if (existing) {
        const [row] = await db.update(profileSettings).set(updates).where(eq(profileSettings.profileId, payload.profileId)).returning();
        res.json(row);
      } else {
        const [row] = await db.insert(profileSettings).values({ profileId: payload.profileId, ...updates }).returning();
        res.json(row);
      }
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/profile/family-settings — settings di tutti i membri (per monitoraggio anziani/scuola)
  app.get("/api/profile/family-settings", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const members = await db.select().from(profiles).where(eq(profiles.familyId, payload.familyId));
      const memberIds = members.map(m => m.id);
      const allSettings = memberIds.length > 0
        ? await db.select().from(profileSettings).where(inArray(profileSettings.profileId, memberIds))
        : [];
      const settingsMap = new Map(allSettings.map(s => [s.profileId, s]));
      const result = members.map(m => ({
        profile: { id: m.id, name: m.name, role: m.role, colorHex: m.colorHex },
        settings: settingsMap.get(m.id) || null,
      }));
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── CHECK-IN CONSENSUALE ─────────────────────────────────────────────────

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

      // Aggiorna reward points
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

  // ─── AI NARRATIVA PER MEMBRO ──────────────────────────────────────────────

  // GET /api/ai/narrative/:memberId
  app.get("/api/ai/narrative/:memberId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const narrative = await generateMemberNarrative(payload.familyId, req.params.memberId);
      res.json({ narrative: narrative || "Nessun dato disponibile per generare la narrativa." });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── SCHOOL ───────────────────────────────────────────────────────────────

  // GET /api/school/connections
  app.get("/api/school/connections", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolConnections).where(eq(schoolConnections.familyId, payload.familyId)).orderBy(desc(schoolConnections.createdAt));
      const safe = rows.map(r => ({ ...r, password: "***" }));
      res.json(safe);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/school/connect — aggiunge e verifica una connessione
  app.post("/api/school/connect", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { platform, username, password, schoolCode, studentName } = req.body;
      if (!platform || !username || !password || !studentName) return res.status(400).json({ message: "Campi obbligatori mancanti" });

      let studentId = "";
      let resolvedName = studentName;
      try {
        if (platform === "classeviva") {
          const session = await classevivaLogin(username, password);
          studentId = session.studentId;
          if (session.firstName || session.lastName) resolvedName = `${session.firstName} ${session.lastName}`.trim();
        } else if (platform === "argo") {
          if (!schoolCode) return res.status(400).json({ message: "Codice scuola obbligatorio per Argo" });
          const session = await argoLogin(schoolCode, username, password);
          studentId = session.studentId;
          if (session.firstName || session.lastName) resolvedName = `${session.firstName} ${session.lastName}`.trim();
        } else {
          return res.status(400).json({ message: "Piattaforma non supportata" });
        }
      } catch (e: any) {
        return res.status(401).json({ message: `Credenziali non valide: ${e.message}` });
      }

      const [conn] = await db.insert(schoolConnections).values({
        familyId: payload.familyId,
        userId: payload.profileId,
        platform,
        studentName: resolvedName,
        schoolCode: schoolCode || null,
        username,
        password,
        studentId,
      }).returning();

      res.json({ ...conn, password: "***" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // DELETE /api/school/connections/:id
  app.delete("/api/school/connections/:id", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const conn = await db.select().from(schoolConnections).where(and(eq(schoolConnections.id, req.params.id), eq(schoolConnections.familyId, payload.familyId)));
      if (!conn.length) return res.status(404).json({ message: "Connessione non trovata" });
      await db.delete(schoolGrades).where(eq(schoolGrades.connectionId, req.params.id));
      await db.delete(schoolAbsences).where(eq(schoolAbsences.connectionId, req.params.id));
      await db.delete(schoolHomework).where(eq(schoolHomework.connectionId, req.params.id));
      await db.delete(schoolNotices).where(eq(schoolNotices.connectionId, req.params.id));
      await db.delete(schoolConnections).where(eq(schoolConnections.id, req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/school/sync/:id — sincronizza voti, assenze, compiti, avvisi
  app.post("/api/school/sync/:id", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const [conn] = await db.select().from(schoolConnections).where(and(eq(schoolConnections.id, req.params.id), eq(schoolConnections.familyId, payload.familyId)));
      if (!conn) return res.status(404).json({ message: "Connessione non trovata" });

      let grades: any[] = [], absences: any[] = [], homework: any[] = [], notices: any[] = [];

      if (conn.platform === "classeviva") {
        let session;
        try { session = await classevivaLogin(conn.username, conn.password); }
        catch (e: any) {
          await db.update(schoolConnections).set({ syncError: e.message }).where(eq(schoolConnections.id, conn.id));
          return res.status(401).json({ message: `Login fallito: ${e.message}` });
        }
        [grades, absences, homework, notices] = await Promise.all([
          classevivaGrades(session),
          classevivaAbsences(session),
          classevivaHomework(session),
          classevivaNotices(session),
        ]);
      } else if (conn.platform === "argo") {
        let session;
        try { session = await argoLogin(conn.schoolCode!, conn.username, conn.password); }
        catch (e: any) {
          await db.update(schoolConnections).set({ syncError: e.message }).where(eq(schoolConnections.id, conn.id));
          return res.status(401).json({ message: `Login fallito: ${e.message}` });
        }
        [grades, absences, homework, notices] = await Promise.all([
          argoGrades(session),
          argoAbsences(session),
          argoHomework(session),
          argoNotices(session),
        ]);
      }

      // Elimina vecchi dati e reinserisce
      await db.delete(schoolGrades).where(eq(schoolGrades.connectionId, conn.id));
      await db.delete(schoolAbsences).where(eq(schoolAbsences.connectionId, conn.id));
      await db.delete(schoolHomework).where(eq(schoolHomework.connectionId, conn.id));
      await db.delete(schoolNotices).where(eq(schoolNotices.connectionId, conn.id));

      if (grades.length) await db.insert(schoolGrades).values(grades.map((g: any) => ({ ...g, connectionId: conn.id, familyId: conn.familyId })));
      if (absences.length) await db.insert(schoolAbsences).values(absences.map((a: any) => ({ ...a, connectionId: conn.id, familyId: conn.familyId })));
      if (homework.length) await db.insert(schoolHomework).values(homework.map((h: any) => ({ ...h, connectionId: conn.id, familyId: conn.familyId })));
      if (notices.length) await db.insert(schoolNotices).values(notices.map((n: any) => ({ ...n, connectionId: conn.id, familyId: conn.familyId })));

      await db.update(schoolConnections).set({ lastSync: new Date(), syncError: null }).where(eq(schoolConnections.id, conn.id));
      res.json({ grades: grades.length, absences: absences.length, homework: homework.length, notices: notices.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/school/grades/:connectionId
  app.get("/api/school/grades/:connectionId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolGrades).where(and(eq(schoolGrades.connectionId, req.params.connectionId), eq(schoolGrades.familyId, payload.familyId))).orderBy(desc(schoolGrades.date));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/school/absences/:connectionId
  app.get("/api/school/absences/:connectionId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolAbsences).where(and(eq(schoolAbsences.connectionId, req.params.connectionId), eq(schoolAbsences.familyId, payload.familyId))).orderBy(desc(schoolAbsences.date));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/school/homework/:connectionId
  app.get("/api/school/homework/:connectionId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolHomework).where(and(eq(schoolHomework.connectionId, req.params.connectionId), eq(schoolHomework.familyId, payload.familyId))).orderBy(desc(schoolHomework.givenAt));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // GET /api/school/notices/:connectionId
  app.get("/api/school/notices/:connectionId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolNotices).where(and(eq(schoolNotices.connectionId, req.params.connectionId), eq(schoolNotices.familyId, payload.familyId))).orderBy(desc(schoolNotices.date));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // PATCH /api/school/homework/:id/done — segna compito fatto/non fatto
  app.patch("/api/school/homework/:id/done", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { done } = req.body;
      await db.update(schoolHomework).set({ done: !!done }).where(and(eq(schoolHomework.id, req.params.id), eq(schoolHomework.familyId, payload.familyId)));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/briefing/chat — AI assistant for Briefing page
  app.post("/api/briefing/chat", async (req, res) => {
    try {
      const a = await auth(req, res);
      if (!a) return;
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: "Messaggio vuoto" });

      const [family, members, eventsData, medsData, tasksData, shoppingData] = await Promise.all([
        storage.getFamilyById(a.familyId),
        storage.getFamilyMembers(a.familyId),
        storage.getEventsByFamily(a.familyId),
        storage.getMedicationsByFamily(a.familyId),
        storage.getTasksByFamily(a.familyId),
        storage.getShoppingItems(a.familyId),
      ]);

      const now = new Date();
      const upcoming = eventsData
        .filter(e => new Date(e.startAt) > now)
        .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        .slice(0, 3);
      const pendingTasks = tasksData.filter(t => !t.completedAt).length;
      const pendingItems = shoppingData.filter(i => !i.checked).length;
      const activeMeds = medsData.filter(m => m.active);

      const context = [
        `Famiglia: ${family?.name || "Sconosciuta"}`,
        `Ora: ${now.toLocaleString("it-IT")}`,
        `Membri: ${members.map(m => `${m.name} (${m.role})`).join(", ")}`,
        upcoming.length > 0
          ? `Prossimi eventi: ${upcoming.map(e => `"${e.title}" il ${new Date(e.startAt).toLocaleString("it-IT")}`).join("; ")}`
          : "Nessun evento in programma",
        activeMeds.length > 0
          ? `Farmaci attivi: ${activeMeds.map(m => `${m.name} (${m.scheduleTimes?.join(", ")})`).join(", ")}`
          : "Nessun farmaco attivo",
        `Compiti in sospeso: ${pendingTasks}`,
        `Articoli da comprare: ${pendingItems}`,
      ].join("\n");

      const prompt = `Sei l'assistente AI di FamilyTracker, un'app italiana di coordinamento familiare. Rispondi sempre in italiano, in modo conciso, caldo e utile. Non elencare mai dati raw — sintetizza e dai consigli pratici. Massimo 3-4 frasi.

Contesto attuale della famiglia:
${context}

L'utente dice: "${message}"

Risposta:`;

      const reply = await callClaude(prompt, 350);
      if (!reply) return res.status(503).json({ message: "AI temporaneamente non disponibile" });
      res.json({ reply });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── KITCHEN AI ────────────────────────────────────────────────────────────
  app.get("/api/kitchen/preferences", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getFoodPreferences(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/kitchen/preferences", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { profileId, likes, dislikes, allergies, dietaryRestrictions } = req.body;
      const result = await storage.upsertFoodPreferences(a.familyId, profileId || null, { likes, dislikes, allergies, dietaryRestrictions });
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/kitchen/scan", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { imageBase64, mediaType = "image/jpeg", mode = "recipes" } = req.body;
      if (!imageBase64) return res.status(400).json({ message: "imageBase64 obbligatorio" });

      const prefs = await storage.getFoodPreferences(a.familyId);
      const shopping = await storage.getShoppingItems(a.familyId);
      const boughtItems = shopping.map((s: any) => s.name).join(", ") || "nessuno";

      const allergiesInfo = prefs.flatMap(p => p.allergies || []).filter(Boolean).join(", ") || "nessuna";
      const dislikesInfo = prefs.flatMap(p => p.dislikes || []).filter(Boolean).join(", ") || "nessuno";

      let prompt: string;
      if (mode === "missing") {
        prompt = `Analizza questa foto del frigo/dispensa. 
Prodotti che la famiglia acquista abitualmente: ${boughtItems}.
Allergie/intolleranze: ${allergiesInfo}.

Identifica cosa manca rispetto agli acquisti abituali. Rispondi SOLO con questo JSON (nessun testo prima o dopo):
{"missingItems": [{"name": "...", "category": "...", "priority": "alta|media|bassa", "reason": "..."}], "detectedItems": ["item1", "item2"]}`;
      } else {
        prompt = `Analizza questa foto del frigo/dispensa.
Allergie/intolleranze da evitare: ${allergiesInfo}.
Ingredienti da evitare: ${dislikesInfo}.

Identifica tutti gli ingredienti visibili e proponi 3 ricette creative che si possono preparare con ciò che c'è. Rispondi SOLO con questo JSON (nessun testo prima o dopo):
{"detectedIngredients": ["ing1", "ing2"], "recipes": [{"name": "...", "time": "...", "difficulty": "facile|media|difficile", "ingredients": ["..."], "steps": ["..."], "emoji": "🍝"}]}`;
      }

      const raw = await callClaudeVision(prompt, imageBase64, mediaType, 1500);
      if (!raw) return res.status(503).json({ message: "AI temporaneamente non disponibile" });
      const result = parseJSON(raw);
      if (!result) return res.status(500).json({ message: "Risposta AI non valida", raw });
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/kitchen/menu", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const prefs = await storage.getFoodPreferences(a.familyId);
      const members = await storage.getFamilyMembers(a.familyId);
      const shopping = await storage.getShoppingItems(a.familyId);
      const availableItems = shopping.filter((s: any) => !s.checked).map((s: any) => s.name).join(", ") || "nessuno";

      const allergies = prefs.flatMap(p => p.allergies || []).filter(Boolean);
      const dislikes = prefs.flatMap(p => p.dislikes || []).filter(Boolean);
      const likes = prefs.flatMap(p => p.likes || []).filter(Boolean);
      const dietary = prefs.flatMap(p => p.dietaryRestrictions || []).filter(Boolean);
      const names = members.map((m: any) => m.name.split(" ")[0]).join(", ");

      const prompt = `Sei uno chef italiano che crea menu settimanali per famiglie.
Famiglia: ${names} (${members.length} persone).
Piatti preferiti: ${likes.join(", ") || "nessuna preferenza"}.
Allergie/intolleranze: ${allergies.join(", ") || "nessuna"}.
Da evitare: ${dislikes.join(", ") || "nessuno"}.
Restrizioni dietetiche: ${dietary.join(", ") || "nessuna"}.
Ingredienti già disponibili: ${availableItems}.

Crea un menu per 7 giorni (pranzo e cena per ogni giorno) bilanciato e vario, usando ingredienti stagionali italiani. Rispondi SOLO con questo JSON:
{"week": [{"day": "Lunedì", "lunch": {"name": "...", "time": "...", "emoji": "🍝"}, "dinner": {"name": "...", "time": "...", "emoji": "🍖"}}]}`;

      const raw = await callClaude(prompt, 2000);
      if (!raw) return res.status(503).json({ message: "AI temporaneamente non disponibile" });
      const result = parseJSON(raw);
      if (!result) return res.status(500).json({ message: "Risposta AI non valida" });
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Documents ───────────────────────────────────────────────────────────────
  const objStore = new ObjectStorageService();

  // Presigned URL for direct-to-cloud document upload
  app.post("/api/documents/upload-url", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, size, contentType } = req.body;
      if (!name) return res.status(400).json({ message: "name obbligatorio" });
      const uploadURL = await objStore.getObjectEntityUploadURL();
      const objectPath = objStore.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/documents", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    const section = req.query.section as string | undefined;
    try {
      const docs = await storage.getDocuments(a.familyId, a.profileId, section);
      // Strip fileData (base64) from list view — only return objectPath
      const stripped = docs.map(({ fileData, ...rest }) => rest);
      res.json(stripped);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/documents/:id/file", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const doc = await storage.getDocumentById(req.params.id, a.familyId);
      if (!doc) return res.status(404).json({ message: "Non trovato" });
      if (doc.isPrivate && doc.profileId !== a.profileId) return res.status(403).json({ message: "Documento privato" });

      // New: serve from object storage
      if (doc.objectPath) {
        try {
          const file = await objStore.getObjectEntityFile(doc.objectPath);
          return await objStore.downloadObject(file, res);
        } catch (e) {
          if (!(e instanceof ObjectNotFoundError)) throw e;
        }
      }
      // Legacy: serve from base64
      if (!doc.fileData) return res.status(404).json({ message: "Nessun file" });
      const buf = Buffer.from(doc.fileData, "base64");
      res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `inline; filename="${doc.fileName || "document"}"`);
      res.send(buf);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/documents", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { title, category, section, profileId, notes, isPrivate, expiresAt, fileName, mimeType, fileData, fileSize, objectPath } = req.body;
      if (!title || !category || !section) return res.status(400).json({ message: "Campi obbligatori mancanti" });
      // Legacy base64 size check (still supported)
      if (fileData) {
        const sizeBytes = Buffer.from(fileData, "base64").length;
        if (sizeBytes > 8 * 1024 * 1024) return res.status(413).json({ message: "File troppo grande (max 8MB)" });
      }
      const doc = await storage.createDocument({
        familyId: a.familyId,
        profileId: profileId || null,
        section,
        category,
        title,
        notes: notes || null,
        isPrivate: !!isPrivate,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        fileName: fileName || null,
        mimeType: mimeType || null,
        fileData: fileData || null,
        objectPath: objectPath || null,
        fileSize: fileSize || null,
      });
      res.json({ ...doc, fileData: undefined });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/documents/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { title, notes, isPrivate, expiresAt, category } = req.body;
      const doc = await storage.updateDocument(req.params.id, a.familyId, {
        ...(title !== undefined && { title }),
        ...(notes !== undefined && { notes }),
        ...(isPrivate !== undefined && { isPrivate }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(category !== undefined && { category }),
      });
      if (!doc) return res.status(404).json({ message: "Non trovato" });
      res.json({ ...doc, fileData: undefined });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      await storage.deleteDocument(req.params.id, a.familyId);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── WEATHER PROXY ────────────────────────────────────────────────────────
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

  return httpServer;
}
