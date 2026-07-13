import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getTrialDaysLeft, hasPaidSubscription } from '../utils/accountTier';
import {
  beginLogout,
  clearAuthTokens,
  getAccessToken,
  setAuthTokens,
  refreshAccessToken,
} from '../utils/authTokens';
import type { QualityLevelSetting } from '../utils/streamQuality';
import { saveUserStreamQuality } from '../utils/userSettings';
import { showBanner } from '../utils/banner';

export interface User {
  id: number;
  email: string;
  full_name: string;
  profile_image_url?: string | null;
  role: 'listener' | 'studio_admin' | 'radio_admin' | 'admin';
  real_role?: 'listener' | 'studio_admin' | 'radio_admin' | 'admin';
  subscription: 'free' | 'premium' | 'unlimited';
  subscription_cycle: 'monthly' | 'yearly' | null;
  subscription_expires_at?: string | null;
  subscription_activated_at?: string | null;
  must_reset_password?: boolean;
  created_at?: string;
  stream_quality?: QualityLevelSetting | null;
  pending_plan_id?: string | null;
  pending_plan_paid?: boolean;
  subscription_cancel_at_period_end?: boolean;
  artist_profile?: {
    id: number;
    user_id: number;
    stage_name: string;
    bio: string | null;
    is_active?: boolean;
    disabled_reason?: string | null;
    reactivation_reason?: string | null;
    reactivation_requested?: boolean;
    profile_complete?: boolean;
    category?: string | null;
    licence?: string | null;
    licence_document_url?: string | null;
    cover_art_url?: string | null;
    street_address?: string | null;
    city?: string | null;
    state_province?: string | null;
    postal_code?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    languages?: string | null;
    social_twitter?: string | null;
    social_instagram?: string | null;
  } | null;
}

interface AuthContextType {
  token: string | null;
  currentUser: User | null;
  isLoading: boolean;
  authError: string | null;
  isPremium: boolean;
  canConfigureStreamQuality: boolean;
  canAccessPlatformSettings: boolean;
  canAccessStationProfile: boolean;
  userMode: 'admin' | 'listener';
  serverUserMode: 'admin' | 'listener';
  canUsePlaylists: boolean;
  canAccessListeningHistory: boolean;
  isStaffInAdminMode: boolean;
  isSwitchingMode: boolean;
  mustResetPassword: boolean;
  switchUserMode: (mode: 'admin' | 'listener') => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string) => Promise<boolean>;
  logout: () => void;
  socialLogin: (provider: 'google' | 'apple') => Promise<boolean>;
  clearError: () => void;
  fetchCurrentUser: () => Promise<void>;
  updateStreamQuality: (quality: QualityLevelSetting) => Promise<boolean>;
  hasRadioStation: boolean;
  hasStudioProfileComplete: boolean;
  checkRadioStationStatus: (user?: User | null) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = '/api';

export function deriveUserMode(user: User | null): 'admin' | 'listener' {
  if (!user) return 'listener';
  const realRole = user.real_role || user.role;
  if (realRole === 'studio_admin' || realRole === 'radio_admin') {
    return user.role === 'listener' ? 'listener' : 'admin';
  }
  return 'admin';
}

function mergeUserFromApi(prev: User | null, data: unknown): User {
  const api = data as User;
  return {
    ...(prev ?? {}),
    ...api,
    real_role: api.real_role ?? prev?.real_role ?? api.role,
    artist_profile: api.artist_profile ?? prev?.artist_profile ?? null,
    subscription: api.subscription || prev?.subscription || 'free',
    subscription_cycle: api.subscription_cycle ?? prev?.subscription_cycle ?? null,
    subscription_expires_at: api.subscription_expires_at ?? prev?.subscription_expires_at ?? null,
    subscription_activated_at: api.subscription_activated_at ?? prev?.subscription_activated_at ?? null,
    must_reset_password: api.must_reset_password ?? prev?.must_reset_password ?? false,
  } as User;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(getAccessToken());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const [hasRadioStation, setHasRadioStation] = useState<boolean>(false);

  const applyUserFromApi = (data: unknown): User => {
    let merged = mergeUserFromApi(null, data);
    setCurrentUser((prev) => {
      merged = mergeUserFromApi(prev, data);
      return merged;
    });
    return merged;
  };

  const [pendingMode, setPendingMode] = useState<'admin' | 'listener' | null>(null);
  const serverUserMode = deriveUserMode(currentUser);
  const userMode = pendingMode ?? serverUserMode;

  const switchUserMode = async (mode: 'admin' | 'listener'): Promise<boolean> => {
    const accessToken = getAccessToken();
    if (!accessToken || isSwitchingMode || mode === userMode) return false;

    setPendingMode(mode);
    setIsSwitchingMode(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_URL}/auth/switch-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail;
        const message = typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(', ')
            : 'Could not switch mode.';
        throw new Error(message || 'Could not switch mode.');
      }
      const data = await res.json();
      const userWithSub = applyUserFromApi(data);
      if (deriveUserMode(userWithSub) !== mode) {
        throw new Error('Mode did not update on the server. Please try again.');
      }
      setPendingMode(null);
      if ((userWithSub.real_role || userWithSub.role) === 'radio_admin') {
        await checkRadioStationStatus(userWithSub);
      }
      return true;
    } catch (err) {
      setPendingMode(null);
      const message = err instanceof Error ? err.message : 'Could not switch mode.';
      setAuthError(message);
      showBanner('error', 'Mode switch failed', message);
      return false;
    } finally {
      setIsSwitchingMode(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      if (!getAccessToken()) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          setToken(getAccessToken());
          return;
        }
        setIsLoading(false);
        return;
      }
      if (token) {
        fetchCurrentUser();
      } else {
        setCurrentUser(null);
        setIsLoading(false);
      }
    };
    bootstrap();
  }, [token]);

  const fetchCurrentUser = async () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      setCurrentUser(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingMode(null);
        const userWithSub = applyUserFromApi(data);
        if ((userWithSub.real_role || userWithSub.role) === 'radio_admin') {
          await checkRadioStationStatus(userWithSub);
        }
      } else {
        logout();
      }
    } catch {
      setAuthError('Could not reach the authentication service.');
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<boolean> => {
    setAuthError(null);
    setIsLoading(true);
    const cleanedEmail = email.trim().toLowerCase();
    const cleanedPassword = password.trim();
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: cleanedEmail, password: cleanedPassword })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setAuthTokens(data.access_token, data.refresh_token);
        setToken(data.access_token);
        return true;
      }
      setAuthError(data.detail || 'Invalid credentials.');
      return false;
    } catch {
      setAuthError('Could not connect to auth service.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, fullName: string): Promise<boolean> => {
    setAuthError(null);
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim(),
          full_name: fullName.trim(),
        })
      });
      const data = await res.json();
      if (res.ok) {
        setAuthError('Registration successful! You can now log in.');
        return true;
      }
      setAuthError(data.detail || 'Registration failed.');
      return false;
    } catch {
      setAuthError('Could not connect to auth service.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const socialLogin = async (provider: 'google' | 'apple'): Promise<boolean> => {
    setAuthError(null);
    setIsLoading(true);
    try {
      setAuthError(
        `${provider === 'google' ? 'Google' : 'Apple'} Sign-In is not available yet. Please use email and password.`,
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const checkRadioStationStatus = async (user?: User | null): Promise<boolean> => {
    const activeUser = user !== undefined ? user : currentUser;
    const realRole = activeUser?.real_role || activeUser?.role;
    if (!activeUser || realRole !== 'radio_admin') {
      setHasRadioStation(false);
      return false;
    }
    try {
      const res = await fetch(`${API_URL}/radio`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        const ownsStation = data.some((s: { owner_id: number }) => s.owner_id === activeUser.id);
        setHasRadioStation(ownsStation);
        return ownsStation;
      }
    } catch (e) {
      console.warn('Failed to check radio station status:', e);
    }
    setHasRadioStation(false);
    return false;
  };

  const logout = async () => {
    const accessToken = getAccessToken();
    beginLogout();

    if (accessToken) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        });
      } catch {
        // Best-effort server-side refresh token revocation
      }
    }

    clearAuthTokens();
    setToken(null);
    setCurrentUser(null);
    setAuthError(null);
    setHasRadioStation(false);
    setIsLoading(false);
  };

  const clearError = () => setAuthError(null);

  const updateStreamQuality = useCallback(async (quality: QualityLevelSetting): Promise<boolean> => {
    const ok = await saveUserStreamQuality(quality);
    if (ok) {
      setCurrentUser((prev) => (prev ? { ...prev, stream_quality: quality } : prev));
    }
    return ok;
  }, []);

  const isTrialActive = () => getTrialDaysLeft(currentUser) > 0;

  const userRole = currentUser?.real_role || currentUser?.role;

  const isPremium =
    hasPaidSubscription(currentUser) ||
    userRole === 'admin' ||
    (userRole === 'studio_admin' && serverUserMode === 'admin') ||
    (currentUser?.subscription === 'free' && isTrialActive());

  const canConfigureStreamQuality = hasPaidSubscription(currentUser);
  const isStaffInAdminMode =
    (userRole === 'radio_admin' || userRole === 'studio_admin') &&
    serverUserMode === 'admin' &&
    !isSwitchingMode;
  const canAccessPlatformSettings =
    !!currentUser &&
    (userRole === 'admin' || userRole === 'listener' || serverUserMode === 'listener');
  const canAccessStationProfile =
    !!currentUser &&
    (userRole === 'admin' || (userRole === 'radio_admin' && serverUserMode === 'admin'));
  const canUsePlaylists = !!token && !isStaffInAdminMode;
  const canAccessListeningHistory = !!token && !isStaffInAdminMode;
  const mustResetPassword = !!(
    currentUser?.role === 'admin' && currentUser?.must_reset_password
  );
  const hasStudioProfileComplete = !!currentUser?.artist_profile?.profile_complete;

  return (
    <AuthContext.Provider value={{
      token,
      currentUser,
      isLoading,
      authError,
      isPremium,
      canConfigureStreamQuality,
      canAccessPlatformSettings,
      canAccessStationProfile,
      userMode,
      serverUserMode,
      canUsePlaylists,
      canAccessListeningHistory,
      isStaffInAdminMode,
      isSwitchingMode,
      mustResetPassword,
      hasRadioStation,
      hasStudioProfileComplete,
      switchUserMode,
      login,
      register,
      logout,
      socialLogin,
      clearError,
      fetchCurrentUser,
      updateStreamQuality,
      checkRadioStationStatus
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
