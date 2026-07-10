import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'listener' | 'studio_admin' | 'radio_admin' | 'admin';
  real_role?: 'listener' | 'studio_admin' | 'radio_admin' | 'admin';
  subscription: 'free' | 'premium' | 'unlimited';
  subscription_cycle: 'monthly' | 'yearly' | null;
  created_at?: string;
  artist_profile?: {
    id: number;
    user_id: number;
    stage_name: string;
    bio: string | null;
    is_active?: boolean;
    disabled_reason?: string | null;
    reactivation_reason?: string | null;
    reactivation_requested?: boolean;
  } | null;
}

interface AuthContextType {
  token: string | null;
  currentUser: User | null;
  isLoading: boolean;
  authError: string | null;
  isPremium: boolean;
  userMode: 'admin' | 'listener';
  canUsePlaylists: boolean;
  switchUserMode: (mode: 'admin' | 'listener') => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string) => Promise<boolean>;
  logout: () => void;
  socialLogin: (provider: 'google' | 'apple') => Promise<boolean>;
  clearError: () => void;
  fetchCurrentUser: () => Promise<void>;
  hasRadioStation: boolean;
  checkRadioStationStatus: (user?: User | null) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_URL = '/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userMode, setUserMode] = useState<'admin' | 'listener'>(() => {
    return (localStorage.getItem('userMode') as 'admin' | 'listener') || 'admin';
  });
  const [hasRadioStation, setHasRadioStation] = useState<boolean>(false);

  const switchUserMode = (mode: 'admin' | 'listener') => {
    localStorage.setItem('userMode', mode);
    setUserMode(mode);
  };

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setCurrentUser(null);
      setIsLoading(false);
    }
  }, [token, userMode]);

  const fetchCurrentUser = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const userWithSub: User = {
          ...data,
          subscription: data.role === 'admin' ? 'premium' : (data.subscription || 'free'),
          subscription_cycle: data.subscription_cycle || null
        };
        setCurrentUser(userWithSub);
        if (userWithSub.role === 'admin') {
          localStorage.setItem('userMode', 'admin');
          setUserMode('admin');
        }
        if (userWithSub.role === 'radio_admin') {
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
        body: JSON.stringify({ email: cleanedEmail, password: cleanedPassword })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem('token', data.access_token);
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
      const email = `${provider}.user@verisonic.com`;
      const name = `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`;
      const res = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem('token', data.access_token);
        setToken(data.access_token);
        return true;
      }
      setAuthError('Social login failed.');
      return false;
    } catch {
      setAuthError('Could not connect to auth service.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const checkRadioStationStatus = async (user?: User | null): Promise<boolean> => {
    const activeUser = user !== undefined ? user : currentUser;
    if (!activeUser || activeUser.role !== 'radio_admin') {
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

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    setAuthError(null);
    setHasRadioStation(false);
  };

  const clearError = () => setAuthError(null);

  const isTrialActive = () => {
    if (!currentUser?.created_at) return false;
    const createdAt = new Date(currentUser.created_at);
    const now = new Date();
    const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 7;
  };

  const isPremium =
    ['premium', 'unlimited'].includes(currentUser?.subscription || '') ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'studio_admin' ||
    (currentUser?.subscription === 'free' && isTrialActive());

  const userRole = currentUser?.real_role || currentUser?.role;
  const isRadioAdminInAdminMode = userRole === 'radio_admin' && userMode === 'admin';
  const canUsePlaylists = !!token && !isRadioAdminInAdminMode;

  return (
    <AuthContext.Provider value={{
      token,
      currentUser,
      isLoading,
      authError,
      isPremium,
      userMode,
      canUsePlaylists,
      hasRadioStation,
      switchUserMode,
      login,
      register,
      logout,
      socialLogin,
      clearError,
      fetchCurrentUser,
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
