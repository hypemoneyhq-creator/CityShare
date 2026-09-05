import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { UserProfile } from '../api/client';

interface Session {
  token: string;
  user: UserProfile;
}

interface AuthContextValue {
  session: Session | undefined;
  setSession: (session: Session) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | undefined>();

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      setSession: setSessionState,
      clearSession: () => setSessionState(undefined),
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
