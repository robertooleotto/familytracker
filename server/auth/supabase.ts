/**
 * Supabase server-side admin client wrapper.
 *
 * This module is loaded LAZILY via dynamic import so that:
 *  1. The app starts up even if `@supabase/supabase-js` isn't installed yet
 *     (we are mid-migration; some environments will not have it).
 *  2. The app starts up even if SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env
 *     vars are missing — we only crash when someone actually tries to use
 *     Supabase auth, not on boot.
 *
 * IMPORTANT: SUPABASE_SERVICE_ROLE_KEY bypasses RLS. It must NEVER be exposed
 * to the browser, only ever used from server code. Treat it like a root
 * password.
 *
 * Usage:
 *   const admin = await getSupabaseAdmin();
 *   const { data, error } = await admin.auth.admin.createUser({...});
 *
 *   const result = await verifySupabaseAccessToken(jwt);
 *   if (result.ok) { result.user.id ... }
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";

let cachedAdmin: SupabaseClient | null = null;

/**
 * Returns true when both required env vars are present.
 * Use this to gate Supabase-auth-only code paths and feature flags.
 */
export function isSupabaseAuthConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Lazily construct and cache the Supabase admin client.
 * Throws a descriptive error if env vars are missing or the package isn't
 * installed.
 */
export async function getSupabaseAdmin(): Promise<SupabaseClient> {
  if (cachedAdmin) return cachedAdmin;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "[supabase-auth] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set " +
        "to use the Supabase admin client. Check your .env file.",
    );
  }

  // Dynamic import keeps the dependency optional at boot time. If the package
  // isn't installed yet (e.g. CI hasn't run `npm install` after we added it
  // to package.json), the rest of the app still works.
  let createClient: typeof import("@supabase/supabase-js").createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch (err) {
    throw new Error(
      "[supabase-auth] @supabase/supabase-js is not installed. Run `npm install` " +
        "to pick up the new dependency.",
    );
  }

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: {
      // The admin client must NOT persist sessions or auto-refresh tokens —
      // it's a stateless server-side client used to manage other users.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return cachedAdmin;
}

export type VerifyTokenResult =
  | { ok: true; user: User }
  | { ok: false; reason: "missing_token" | "invalid_token" | "not_configured" | "error"; message?: string };

/**
 * Verify a Supabase access token (JWT issued by supabase auth) and return the
 * authenticated user. Does NOT look up the local profile — that's the caller's
 * job, since profile lookup is application logic.
 *
 * Returns a discriminated union so callers can branch on `ok` without try/catch.
 */
export async function verifySupabaseAccessToken(
  token: string | undefined | null,
): Promise<VerifyTokenResult> {
  if (!token) return { ok: false, reason: "missing_token" };
  if (!isSupabaseAuthConfigured()) return { ok: false, reason: "not_configured" };

  try {
    const admin = await getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) {
      return { ok: false, reason: "invalid_token", message: error?.message };
    }
    return { ok: true, user: data.user };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Reset the cached admin client. Test-only escape hatch — never call from
 * application code.
 */
export function __resetSupabaseAdminCacheForTests() {
  cachedAdmin = null;
}
