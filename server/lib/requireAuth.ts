/**
 * requireAuth — single Express middleware that verifies the Supabase JWT
 * bearer token and attaches `{ profileId, familyId, authUserId, profile }`
 * to `req.auth`. Routes that need the caller's identity destructure
 * `req.auth!` instead of the old pattern of calling `auth(req, res)`
 * manually and short-circuiting on null.
 *
 * The middleware is intentionally narrow: it ONLY handles "is the request
 * authenticated?". Authorisation (is this user a parent? do they own this
 * resource?) lives in the route handlers and storage layer.
 */

import type { NextFunction, Request, Response } from "express";
import { verifySupabaseAccessToken } from "../auth/supabase";
import { storage } from "../storage";

function readBearer(req: { headers: { authorization?: string } }): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

/**
 * Hard auth: rejects with 401 if there is no valid bearer token. Use this on
 * every route that needs an authenticated caller. Populates the full
 * SupabaseAuthContext (profileId, familyId, authUserId, profile).
 */
// Typed as a generic function so that Express's `app.get<Route>(path, ...handlers)`
// overload (which sets P = RouteParameters<Route>) is still selected even when
// requireAuth is in the chain. If we typed it as a `RequestHandler` (which
// defaults P to `ParamsDictionary`), Express would fall back to the looser
// overload and `req.params.id` would widen to `string | string[]` in every
// downstream handler.
export async function requireAuth<P>(
  req: Request<P>,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readBearer(req);
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const result = await verifySupabaseAccessToken(token);
  if (!result.ok) {
    res.status(401).json({ message: "Invalid token" });
    return;
  }

  const profile = await storage.getProfileByAuthUserId(result.user.id);
  if (!profile) {
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

/**
 * Soft auth: populates `req.auth` if a valid token is present, but never
 * rejects. Use on endpoints that have both an authenticated and an anonymous
 * code path (rare — most routes should use `requireAuth`).
 */
export async function tryAuth<P>(
  req: Request<P>,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = readBearer(req);
  if (token) {
    const result = await verifySupabaseAccessToken(token);
    if (result.ok) {
      const profile = await storage.getProfileByAuthUserId(result.user.id);
      if (profile) {
        req.auth = {
          profileId: profile.id,
          familyId: profile.familyId,
          authUserId: result.user.id,
          profile,
        };
      }
    }
  }
  next();
}
