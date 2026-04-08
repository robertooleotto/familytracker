import type { Express } from "express";
import { storage } from "../storage";
import {
  generateInviteCode,
  hashPassword,
  verifyPassword,
  generateToken,
  safe,
} from "../lib/routeHelpers";
import { validateBody } from "../lib/validate";
import { registerSchema, loginSchema, joinSchema } from "../lib/authSchemas";

/**
 * Helper: derive a unique username from email or name
 */
const makeUsername = async (base: string): Promise<string> => {
  const slug = base.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  let candidate = slug;
  let n = 1;
  while (await storage.getProfileByUsername(candidate)) {
    candidate = `${slug}${n++}`;
  }
  return candidate;
};

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/register", validateBody(registerSchema), async (req, res) => {
    try {
      const { firstName, lastName, email, password, familyName, role, colorHex } =
        req.validated.body as import("../lib/authSchemas").RegisterInput;
      const existing = await storage.getProfileByEmail(email);
      if (existing) return res.status(409).json({ message: "Email già registrata" });
      const username = await makeUsername(email.split("@")[0]);
      const name = `${firstName} ${lastName}`;
      const family = await storage.createFamily({ name: familyName, inviteCode: generateInviteCode() });
      const profile = await storage.createProfile({
        name,
        lastName,
        email,
        username,
        passwordHash: await hashPassword(password),
        familyId: family.id,
        role: role || "parent",
        colorHex: colorHex || "#3B82F6",
        uiMode: "full",
        avatarUrl: null,
        fcmToken: null,
        locationPaused: false,
      });
      res.json({ profile: safe(profile), token: generateToken(profile.id, family.id) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/login", validateBody(loginSchema), async (req, res) => {
    try {
      const { email, password } = req.validated.body as import("../lib/authSchemas").LoginInput;
      // Accept login by email or username
      let profile = await storage.getProfileByEmail(email);
      if (!profile) profile = await storage.getProfileByUsername(email);
      if (!profile) return res.status(401).json({ message: "Email o password errata" });

      const { ok, upgradedHash } = await verifyPassword(password, profile.passwordHash);
      if (!ok) return res.status(401).json({ message: "Email o password errata" });

      // Auto-upgrade legacy SHA-256 hash to bcrypt on successful login
      if (upgradedHash) {
        await storage.updateProfile(profile.id, { passwordHash: upgradedHash });
        console.log(`[auth] Upgraded legacy SHA-256 hash to bcrypt for profile ${profile.id}`);
      }

      res.json({ profile: safe(profile), token: generateToken(profile.id, profile.familyId) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/auth/join", validateBody(joinSchema), async (req, res) => {
    try {
      const { firstName, lastName, email, password, inviteCode, role, colorHex } =
        req.validated.body as import("../lib/authSchemas").JoinInput;
      const family = await storage.getFamilyByInviteCode(inviteCode.toUpperCase());
      if (!family) return res.status(404).json({ message: "Codice invito non valido" });
      if (email) {
        const existing = await storage.getProfileByEmail(email);
        if (existing) return res.status(409).json({ message: "Email già registrata" });
      }
      const baseSlug = email ? email.split("@")[0] : `${firstName}${lastName}`;
      const username = await makeUsername(baseSlug);
      const name = `${firstName} ${lastName}`;
      const profile = await storage.createProfile({
        name,
        lastName,
        email: email || null,
        username,
        passwordHash: await hashPassword(password),
        familyId: family.id,
        role: role || "child",
        colorHex: colorHex || "#10B981",
        uiMode: "full",
        avatarUrl: null,
        fcmToken: null,
        locationPaused: false,
      });
      res.json({ profile: safe(profile), token: generateToken(profile.id, family.id) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
