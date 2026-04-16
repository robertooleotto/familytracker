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

/**
 * Returns an Authorization header with a FRESH Supabase access token.
 *
 * The Supabase JS client auto-refreshes the JWT before it expires, so calling
 * `supabase.auth.getSession()` always returns a valid token (as long as the
 * refresh token hasn't been revoked). We fall back to the locally stored
 * ft_session only if the Supabase client has no session at all.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  // Primary: ask the Supabase client, which handles token refresh automatically.
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      return { Authorization: `Bearer ${data.session.access_token}` };
    }
  } catch {
    // Fall through to stored session.
  }
  // Fallback: use the locally stored token (may be stale).
  const session = getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.access_token}` };
}
