import { createContext, useContext } from "react";
import type { Profile } from "@shared/schema";

export interface AuthContextType {
  profile: Profile | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (profile: Profile, token: string) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
  profile: null, token: null, isAuthenticated: false, login: () => {}, logout: () => {},
});

export function useAuthContext() {
  return useContext(AuthContext);
}
