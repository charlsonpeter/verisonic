import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fetchMe, login as apiLogin, register as apiRegister } from '@/api/endpoints';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/api/tokens';
import type { User } from '@/types/models';
import {
  canPlayFullContent,
  getAccountTierLabel,
  hasPaidSubscription,
} from '@/utils/accountTier';

type AuthContextValue = {
  token: string | null;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isPremium: boolean;
  canPlayFull: boolean;
  tierLabel: string;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    const access = await getAccessToken();
    if (!access) {
      setToken(null);
      setUser(null);
      return;
    }
    try {
      const me = await fetchMe(access);
      setToken(access);
      setUser(me);
    } catch {
      await clearAccessToken();
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        await Promise.race([
          refreshUser(),
          new Promise<void>((resolve) => {
            setTimeout(resolve, 4000);
          }),
        ]);
      } catch {
        await clearAccessToken();
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const res = await apiLogin(email.trim().toLowerCase(), password);
      await setAccessToken(res.access_token);
      setToken(res.access_token);
      const me = await fetchMe(res.access_token);
      setUser(me);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
      return false;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    setError(null);
    try {
      await apiRegister(email.trim().toLowerCase(), password, fullName.trim());
      return login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
      return false;
    }
  }, [login]);

  const logout = useCallback(async () => {
    await clearAccessToken();
    setToken(null);
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isLoading,
      error,
      isPremium: hasPaidSubscription(user),
      canPlayFull: canPlayFullContent(user),
      tierLabel: getAccountTierLabel(user),
      login,
      register,
      logout,
      refreshUser,
      clearError,
    }),
    [token, user, isLoading, error, login, register, logout, refreshUser, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
