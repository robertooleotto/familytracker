/**
 * requireAuth — single Express middleware that verifies the JWT bearer token
 * and attaches `{ profileId, familyId }` to `req.auth`. Routes that need the
 * caller's identity destructure `req.auth!` instead of the old pattern of
 * calling `auth(req, res)` manually and short-circuiting on null.
 *
 * The middleware is intentionally narrow: it ONLY handles "is the request
 * authenticated?". Authorisation (is this user a parent? do they own this
 * resource?) lives in the route handlers and storage layer.
 */

import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "./routeHelpers";

// req.auth's shape is declared in `server/auth/middleware.ts` as
// `SupabaseAuthContext` (with profileId, familyId, authUserId, profile). v1
// routes only need profileId/familyId, so we cast to that shape on populate
// and leave authUserId/profile undefined for the v1 path.

function readBearer(req: { headers: { authorization?: string } }): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  return h.slice(7);
}

/**
 * Hard auth: rejects with 401 if there is no valid bearer token. Use this on
 * every route that needs an authenticated caller. Only populates
 * `profileId` / `familyId` on `req.auth` — the Supabase-specific fields stay
 * undefined for v1 routes.
 */
// Typed as a generic function so that Express's `app.get<Route>(path, ...handlers)`
// overload (which sets P = RouteParameters<Route>) is still selected even when
// requireAuth is in the chain. If we typed it as a `RequestHandler` (which
// defaults P to `ParamsDictionary`), Express would fall back to the looser
// overload and `req.params.id` would widen to `string | string[]` in every
// downstream handler.
export function requireAuth<P>(req: Request<P>, res: Response, next: NextFunction): void {
  const token = readBearer(req);
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ message: "Invalid token" });
    return;
  }
  // The Request.auth type is SupabaseAuthContext with required authUserId
  // and profile fields. v1 tokens don't carry those, so we cast through
  // unknown — every v1 route only reads profileId/familyId, never the
  // Supabase-only fields.
  req.auth = { profileId: payload.profileId, familyId: payload.familyId } as unknown as Request["auth"];
  next();
}

/**
 * Soft auth: populates `req.auth` if a valid token is present, but never
 * rejects. Use on endpoints that have both an authenticated and an anonymous
 * code path (rare — most routes should use `requireAuth`).
 */
export function tryAuth<P>(req: Request<P>, _res: Response, next: NextFunction): void {
  const token = readBearer(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.auth = { profileId: payload.profileId, familyId: payload.familyId } as unknown as Request["auth"];
    }
  }
  next();
}
