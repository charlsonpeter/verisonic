import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError, onSessionInvalid, refreshAccessToken } from '@/api/client';
import { fetchMe, login as apiLogin, register as apiRegister } from '@/api/endpoints';
import {
  clearAuthTokens,
  getAccessToken,
  setAuthTokens,
} from '@/api/tokens';
import type { User } from '@/types/models';
import {
  canPlayFullContent,
  getAccountTierLabel,
  hasPaidSubscription,
} from '@/utils/accountTier';
import { API_URL } from '@/utils/constants';

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

  const logout = useCallback(async () => {
    const access = await getAccessToken();
    await clearAuthTokens();
    setToken(null);
    setUser(null);
    if (access) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${access}`,
          },
        });
      } catch {
        // Best-effort server revoke
      }
    }
  }, []);

  useEffect(() => onSessionInvalid(() => {
    setToken(null);
    setUser(null);
  }), []);

  const refreshUser = useCallback(async () => {
    let access = await getAccessToken();
    if (!access) {
      const refreshed = await refreshAccessToken();
      if (refreshed !== 'success') {
        setToken(null);
        setUser(null);
        return;
      }
      access = await getAccessToken();
    }
    if (!access) {
      setToken(null);
      setUser(null);
      return;
    }
    try {
      const me = await fetchMe(access);
      const latest = (await getAccessToken()) || access;
      setToken(latest);
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        // apiRequest already tried refresh; if still auth error, tokens may be cleared.
        const still = await getAccessToken();
        if (!still) {
          setToken(null);
          setUser(null);
        }
        return;
      }
      // Network / server errors: keep existing session.
      setToken(access);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        await refreshUser();
      } catch {
        // Do not clear tokens on unexpected boot errors.
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
      await setAuthTokens(res.access_token, res.refresh_token);
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
