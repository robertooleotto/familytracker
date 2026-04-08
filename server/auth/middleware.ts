/**
 * Express middleware that authenticates a request using a Supabase JWT.
 *
 * Flow:
 *   1. Extract bearer token from Authorization header.
 *   2. Verify it with Supabase (calls auth.getUser internally).
 *   3. Look up the local profile by auth_user_id.
 *   4. Attach { profileId, familyId, authUserId, profile } to req.auth and call next().
 *
 * On any failure, sends a 401 and does NOT call next.
 *
 * IMPORTANT: This middleware is ONLY used by the v2 routes (gated behind
 * SUPABASE_AUTH_ENABLED). Existing v1 routes keep using the legacy
 * `auth(req, res)` helper from server/lib/routeHelpers.ts. Do not mix
 * the two on a single endpoint.
 */

import type { Request, Response, NextFunction } from "express";
import { verifySupabaseAccessToken } from "./supabase";
import { storage } from "../storage";
import type { Profile } from "@shared/schema";

export interface SupabaseAuthContext {
  profileId: string;
  familyId: string;
  authUserId: string;
  profile: Profile;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: SupabaseAuthContext;
  }
}

export async function requireSupabaseAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = header.slice(7);

  const result = await verifySupabaseAccessToken(token);
  if (!result.ok) {
    if (result.reason === "not_configured") {
      // Misconfiguration is a server error, not a client one. Surface it
      // loudly so we notice in logs but don't 500 — clients should fall
      // back to v1 auth.
      console.error("[supabase-auth] verifySupabaseAccessToken called but Supabase is not configured");
      res.status(503).json({ message: "Supabase auth not configured" });
      return;
    }
    res.status(401).json({ message: "Invalid token" });
    return;
  }

  const profile = await storage.getProfileByAuthUserId(result.user.id);
  if (!profile) {
    // The Supabase user exists but no local profile is linked. This means
    // they registered via Supabase but the post-signup hook didn't run, OR
    // the profile was deleted. Either way, we cannot authenticate them.
    console.warn(`[supabase-auth] No local profile linked to auth user ${result.user.id}`);
    res.status(401).json({ message: "No profile linked to this account" });
    return;
  }

  req.auth = {
    profileId: profile.id,
    familyId: profile.familyId,
    authUserId: result.user.id,
    profile,
  };
  next();
}
