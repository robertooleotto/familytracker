import { useState, useCallback } from "react";
import { getSession, setSession, clearSession } from "@/lib/auth";
import type { Profile } from "@shared/schema";

export function useAuth() {
  const [session, setSessionState] = useState(() => getSession());

  const login = useCallback((profile: Profile, access_token: string, refresh_token: string = "") => {
    setSession(profile, access_token, refresh_token);
    setSessionState({ profile, access_token, refresh_token });
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setSessionState(null);
  }, []);

  const updateProfile = useCallback((updatedProfile: Profile) => {
    const current = getSession();
    if (!current) return;
    setSession(updatedProfile, current.access_token, current.refresh_token);
    setSessionState({ profile: updatedProfile, access_token: current.access_token, refresh_token: current.refresh_token });
  }, []);

  return {
    profile: session?.profile ?? null,
    token: session?.access_token ?? null,
    isAuthenticated: !!session,
    login,
    logout,
    updateProfile,
  };
}
