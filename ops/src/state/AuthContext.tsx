import { createContext, useContext, useState, type ReactNode } from 'react';
import type { OpsUser } from '../api/client';

export interface Session {
  token: string;
  user: OpsUser;
}

interface AuthContextValue {
  session: Session | undefined;
  setSession: (session: Session | undefined) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'cityshare-ops-session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | undefined>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : undefined;
    } catch {
      return undefined;
    }
  });

  function setSession(next: Session | undefined) {
    setSessionState(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private browsing / storage disabled — session just won't survive a reload.
    }
  }

  return <AuthContext.Provider value={{ session, setSession }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
