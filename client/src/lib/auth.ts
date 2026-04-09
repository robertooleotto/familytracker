import type { Profile } from "@shared/schema";
import { supabase } from "./supabase";

const SESSION_KEY = "ft_session";

export interface StoredSession {
  profile: Profile;
  access_token: string;
  refresh_token: string;
}

export function getSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(profile: Profile, access_token: string, refresh_token: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ profile, access_token, refresh_token }));
}

export async function clearSession() {
  await supabase.auth.signOut();
  localStorage.removeItem(SESSION_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const session = getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Decode JWT payload to check expiry without external libraries.
 */
function decodeJwtExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Check whether the stored token is expired (or will expire within 60s).
 */
export function isTokenExpired(): boolean {
  const session = getSession();
  if (!session?.access_token) return true;
  const exp = decodeJwtExp(session.access_token);
  if (!exp) return true;
  return Date.now() / 1000 > exp - 60; // 60-second buffer
}

/** Flag to prevent concurrent refresh calls */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * Refresh the Supabase session and update the stored tokens.
 * Returns true if refresh succeeded, false otherwise.
 */
export async function refreshSessionToken(): Promise<boolean> {
  // Deduplicate concurrent refreshes
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const stored = getSession();
      if (!stored?.refresh_token) return false;

      // Make sure the Supabase client knows the current session so it can refresh
      await supabase.auth.setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });

      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        console.warn("[auth] Token refresh failed:", error?.message);
        return false;
      }

      // Update our stored session with the new tokens
      setSession(
        stored.profile,
        data.session.access_token,
        data.session.refresh_token,
      );
      return true;
    } catch (e) {
      console.warn("[auth] Token refresh error:", e);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Get auth headers, refreshing the token first if it's expired.
 * For use in async contexts (mutations, manual fetches).
 */
export async function getAuthHeadersAsync(): Promise<Record<string, string>> {
  if (isTokenExpired()) {
    await refreshSessionToken();
  }
  const session = getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Initialize Supabase session from stored tokens on app start.
 * This lets the Supabase client manage auto-refresh internally.
 */
export async function initSessionFromStorage(): Promise<void> {
  const stored = getSession();
  if (!stored?.access_token || !stored?.refresh_token) return;

  // If the token is expired, try a refresh right away
  if (isTokenExpired()) {
    await refreshSessionToken();
    return;
  }

  // Otherwise just sync the Supabase client so it can auto-refresh later
  await supabase.auth.setSession({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
  });
}

/**
 * Listen for Supabase auth state changes (auto-refresh, sign-out).
 * Call once on app mount. Returns an unsubscribe function.
 */
export function listenForTokenRefresh(): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" && session) {
      const stored = getSession();
      if (stored) {
        setSession(stored.profile, session.access_token, session.refresh_token);
      }
    }
    if (event === "SIGNED_OUT") {
      localStorage.removeItem(SESSION_KEY);
    }
  });
  return data.subscription.unsubscribe;
}
