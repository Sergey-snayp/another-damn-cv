import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, UnauthorizedError, type CurrentUser } from './api';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  signIn(credential: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * On load, ask the server who we are. The session lives in an httpOnly
   * cookie, so the frontend cannot read it — asking is the only way to know.
   */
  useEffect(() => {
    api.me()
      .then(setUser)
      .catch((err: unknown) => {
        if (!(err instanceof UnauthorizedError)) console.error(err);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function signIn(credential: string): Promise<void> {
    setUser(await api.signInWithGoogle(credential));
  }

  async function signOut(): Promise<void> {
    await api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
