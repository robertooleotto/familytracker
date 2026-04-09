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
