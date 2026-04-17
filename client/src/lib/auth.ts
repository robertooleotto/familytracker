import type { Profile } from "@shared/schema";

const SESSION_KEY = "ft_session";

export function getSession(): { profile: Profile; token: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(profile: Profile, token: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ profile, token }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const session = getSession();
  if (!session) return {};
  return { Authorization: `Bearer ${session.token}` };
}
