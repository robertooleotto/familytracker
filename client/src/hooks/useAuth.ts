import { useState, useCallback } from "react";
import { getSession, setSession, clearSession } from "@/lib/auth";
import type { Profile } from "@shared/schema";

export function useAuth() {
  const [session, setSessionState] = useState(() => getSession());

  const login = useCallback((profile: Profile, token: string) => {
    setSession(profile, token);
    setSessionState({ profile, token });
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSessionState(null);
  }, []);

  const updateProfile = useCallback((updatedProfile: Profile) => {
    const current = getSession();
    if (!current) return;
    setSession(updatedProfile, current.token);
    setSessionState({ profile: updatedProfile, token: current.token });
  }, []);

  return {
    profile: session?.profile ?? null,
    token: session?.token ?? null,
    isAuthenticated: !!session,
    login,
    logout,
    updateProfile,
  };
}
