/**
 * Supabase Auth v2 routes (dual-mode migration).
 *
 * These routes live alongside the legacy /api/auth/* routes during the
 * transition to Supabase Auth. They are mounted only when the env var
 * SUPABASE_AUTH_ENABLED=true and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * are set. See server/routes/index.ts for the gating logic.
 *
 * Endpoints:
 *   POST /api/auth/v2/register   — create new family + parent (server-side admin)
 *   POST /api/auth/v2/join       — join existing family by invite code
 *   POST /api/auth/v2/sync       — link an already-authenticated supabase user to a profile
 *   GET  /api/auth/v2/me         — return the profile for the authenticated supabase user
 *
 * Login is NOT exposed here: the frontend talks to supabase-js directly for
 * email/password login (`supabase.auth.signInWithPassword`). The server only
 * needs to verify the resulting JWT, which `requireSupabaseAuth` does.
 *
 * Children without an email get a synthetic invite-only email of the form
 *   child-{shortId}@invite.familytracker.local
 * which Supabase accepts but never sends mail to. They log in by username
 * via the legacy v1 endpoints OR — once we ship a child PIN flow — via a
 * device-bound token.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { generateInviteCode, safe } from "../lib/routeHelpers";
import { getSupabaseAdmin } from "../auth/supabase";
import { requireSupabaseAuth } from "../auth/middleware";
import { validateBody } from "../lib/validate";
import { registerSchema, joinSchema } from "../lib/authSchemas";
import { randomBytes } from "crypto";

const SYNTHETIC_EMAIL_DOMAIN = "invite.familytracker.local";

function syntheticEmail(): string {
  return `child-${randomBytes(6).toString("hex")}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

const makeUsername = async (base: string): Promise<string> => {
  const slug = base.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "user";
  let candidate = slug;
  let n = 1;
  while (await storage.getProfileByUsername(candidate)) {
    candidate = `${slug}${n++}`;
  }
  return candidate;
};

export function registerSupabaseAuthRoutes(app: Express): void {
  /**
   * Register: creates a Supabase auth user AND a local family + profile,
   * linked by auth_user_id. The admin SDK creates the user with email
   * already confirmed, then signs in to mint a session for the response.
   */
  app.post("/api/auth/v2/register", validateBody(registerSchema), async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, email, password, familyName, role, colorHex } =
        req.validated.body as import("../lib/authSchemas").RegisterInput;

      const existingProfile = await storage.getProfileByEmail(email);
      if (existingProfile) {
        return res.status(409).json({ message: "Email già registrata" });
      }

      const admin = await getSupabaseAdmin();

      // 1. Create the supabase auth user (email auto-confirmed; we trust
      //    the registration form for now — in Phase 7 we'll switch to
      //    email confirmation links).
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { firstName, lastName, source: "v2/register" },
      });
      if (createErr || !created?.user) {
        console.error("[auth/v2/register] supabase createUser failed:", createErr);
        return res.status(500).json({ message: createErr?.message || "Registrazione fallita" });
      }
      const authUserId = created.user.id;

      // 2. Create the local family + profile, linked to the supabase user.
      try {
        const username = await makeUsername(email.split("@")[0]);
        const family = await storage.createFamily({
          name: familyName,
          inviteCode: generateInviteCode(),
        });
        const profile = await storage.createProfile({
          name: `${firstName} ${lastName}`,
          lastName,
          email,
          username,
          // Legacy column: still required as NOT NULL by the schema. We
          // store an unusable bcrypt placeholder so the legacy login path
          // refuses to authenticate this user — they must use Supabase.
          passwordHash: "$2b$12$invalid_supabase_only_user_no_legacy_login_allowed.",
          familyId: family.id,
          role: role || "parent",
          colorHex: colorHex || "#3B82F6",
          uiMode: "full",
          avatarUrl: null,
          fcmToken: null,
          locationPaused: false,
          authUserId,
        } as any);

        // 3. Sign in to return a usable session token to the client. We use
        //    the admin client's signInWithPassword which works server-side.
        const { data: session, error: signInErr } =
          await admin.auth.signInWithPassword({ email, password });
        if (signInErr || !session?.session) {
          console.error("[auth/v2/register] post-create signIn failed:", signInErr);
          // Profile is created; client can sign in manually.
          return res.json({
            profile: safe(profile),
            session: null,
            warning: "Account creato ma sessione non avviata; effettua il login.",
          });
        }

        return res.json({
          profile: safe(profile),
          session: {
            access_token: session.session.access_token,
            refresh_token: session.session.refresh_token,
            expires_at: session.session.expires_at,
          },
        });
      } catch (innerErr: any) {
        // Compensating action: roll back the supabase user so we don't
        // leak orphaned auth.users rows.
        console.error("[auth/v2/register] profile creation failed, rolling back supabase user:", innerErr);
        await admin.auth.admin.deleteUser(authUserId).catch((rollbackErr) => {
          console.error("[auth/v2/register] rollback also failed:", rollbackErr);
        });
        throw innerErr;
      }
    } catch (e: any) {
      console.error("[auth/v2/register] error:", e);
      res.status(500).json({ message: e.message || "Errore interno" });
    }
  });

  /**
   * Join: an existing family by invite code. Same flow as register, but no
   * new family is created. If email is omitted (child join), a synthetic
   * email is generated so Supabase accepts the user.
   */
  app.post("/api/auth/v2/join", validateBody(joinSchema), async (req: Request, res: Response) => {
    try {
      const { firstName, lastName, email, password, inviteCode, role, colorHex } =
        req.validated.body as import("../lib/authSchemas").JoinInput;

      const family = await storage.getFamilyByInviteCode(String(inviteCode).toUpperCase());
      if (!family) {
        return res.status(404).json({ message: "Codice invito non valido" });
      }

      const realEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
      if (realEmail) {
        const existing = await storage.getProfileByEmail(realEmail);
        if (existing) return res.status(409).json({ message: "Email già registrata" });
      }
      const supabaseEmail = realEmail || syntheticEmail();

      const admin = await getSupabaseAdmin();
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: supabaseEmail,
        password,
        email_confirm: true,
        user_metadata: { firstName, lastName, source: "v2/join", synthetic: !realEmail },
      });
      if (createErr || !created?.user) {
        console.error("[auth/v2/join] supabase createUser failed:", createErr);
        return res.status(500).json({ message: createErr?.message || "Iscrizione fallita" });
      }
      const authUserId = created.user.id;

      try {
        const baseSlug = realEmail ? realEmail.split("@")[0] : `${firstName}${lastName}`;
        const username = await makeUsername(baseSlug);
        const profile = await storage.createProfile({
          name: `${firstName} ${lastName}`,
          lastName,
          email: realEmail,
          username,
          passwordHash: "$2b$12$invalid_supabase_only_user_no_legacy_login_allowed.",
          familyId: family.id,
          role: role || "child",
          colorHex: colorHex || "#10B981",
          uiMode: "full",
          avatarUrl: null,
          fcmToken: null,
          locationPaused: false,
          authUserId,
        } as any);

        const { data: session } = await admin.auth.signInWithPassword({
          email: supabaseEmail,
          password,
        });

        return res.json({
          profile: safe(profile),
          session: session?.session
            ? {
                access_token: session.session.access_token,
                refresh_token: session.session.refresh_token,
                expires_at: session.session.expires_at,
              }
            : null,
        });
      } catch (innerErr: any) {
        console.error("[auth/v2/join] profile creation failed, rolling back supabase user:", innerErr);
        await admin.auth.admin.deleteUser(authUserId).catch(() => {});
        throw innerErr;
      }
    } catch (e: any) {
      console.error("[auth/v2/join] error:", e);
      res.status(500).json({ message: e.message || "Errore interno" });
    }
  });

  /**
   * Sync: the client already has a Supabase session (e.g. from
   * signInWithPassword on the frontend) but no local profile is linked yet.
   * This happens for users that exist in supabase but not yet in profiles —
   * primarily during the backfill window. The middleware verifies the JWT
   * and then we create-or-find the profile.
   *
   * Note: this endpoint deliberately does NOT use requireSupabaseAuth,
   * because that middleware fails when the profile doesn't exist yet.
   */
  app.post("/api/auth/v2/sync", async (req: Request, res: Response) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { verifySupabaseAccessToken } = await import("../auth/supabase");
      const result = await verifySupabaseAccessToken(header.slice(7));
      if (!result.ok) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // Already linked? Just return it.
      const existing = await storage.getProfileByAuthUserId(result.user.id);
      if (existing) {
        return res.json({ profile: safe(existing), linked: false });
      }

      // Try to link by email.
      const email = result.user.email;
      if (email && !email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`)) {
        const byEmail = await storage.getProfileByEmail(email);
        if (byEmail) {
          const updated = await storage.updateProfile(byEmail.id, {
            authUserId: result.user.id,
          } as any);
          return res.json({ profile: safe(updated), linked: true });
        }
      }

      return res.status(404).json({
        message: "No matching profile found. Use /api/auth/v2/register or /v2/join first.",
      });
    } catch (e: any) {
      console.error("[auth/v2/sync] error:", e);
      res.status(500).json({ message: e.message || "Errore interno" });
    }
  });

  /**
   * Me: returns the authenticated profile. Cheap endpoint clients can hit
   * on app boot to confirm the supabase session is still valid AND maps to
   * a real profile.
   */
  app.get("/api/auth/v2/me", requireSupabaseAuth, (req: Request, res: Response) => {
    return res.json({ profile: safe(req.auth!.profile) });
  });
}
