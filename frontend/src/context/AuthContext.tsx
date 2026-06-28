import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: 'listener' | 'studio_admin' | 'radio_admin' | 'admin';
  subscription: 'free' | 'premium';
  artist_profile?: {
    id: number;
    user_id: number;
    stage_name: string;
    bio: string | null;
  } | null;
}

interface AuthContextType {
  token: string | null;
  currentUser: User | null;
  isLoading: boolean;
  authError: string | null;
  isPremium: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, fullName: string, role: 'listener' | 'studio_admin' | 'radio_admin' | 'admin') => Promise<boolean>;
  logout: () => void;
  socialLogin: (provider: 'google' | 'apple') => Promise<boolean>;
  clearError: () => void;
  fetchCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = '/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setCurrentUser(null);
      setIsLoading(false);
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Check if role is admin -> set premium. Else default premium checking or custom mock.
        const userWithSub: User = {
          ...data,
          subscription: data.role === 'admin' ? 'premium' : (data.subscription || 'free')
        };
        setCurrentUser(userWithSub);
      } else {
        logout();
      }
    } catch (e) {
      console.warn("Backend offline. Fallback to mock session validation.");
      // Fallback: decode basic JWT-like token or load mock user
      if (token === 'mock_admin_token') {
        setCurrentUser({ id: 1, email: 'admin@verisonic.com', full_name: 'Platform Administrator', role: 'admin', subscription: 'premium' });
      } else if (token === 'mock_listener_token') {
        setCurrentUser({ id: 2, email: 'listener@verisonic.com', full_name: 'Audiophile User', role: 'listener', subscription: 'premium' });
      } else if (token === 'mock_guest_token') {
        setCurrentUser({ id: 3, email: 'guest@verisonic.com', full_name: 'Free Listener', role: 'listener', subscription: 'free' });
      } else {
        console.error("Network error during session validation. Preserving token.");
      }
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
      } else {
        setAuthError(data.detail || "Invalid credentials.");
        return false;
      }
    } catch (e) {
      // Mock log-in for development/offline
      if (cleanedEmail === 'admin@verisonic.com' && cleanedPassword === 'admin12345') {
        const mockToken = 'mock_admin_token';
        localStorage.setItem('token', mockToken);
        setToken(mockToken);
        return true;
      } else if (cleanedEmail === 'premium@verisonic.com') {
        const mockToken = 'mock_listener_token';
        localStorage.setItem('token', mockToken);
        setToken(mockToken);
        return true;
      } else if (cleanedEmail === 'free@verisonic.com') {
        const mockToken = 'mock_guest_token';
        localStorage.setItem('token', mockToken);
        setToken(mockToken);
        return true;
      }
      setAuthError("Could not connect to auth service.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, fullName: string, role: 'listener' | 'studio_admin' | 'radio_admin' | 'admin'): Promise<boolean> => {
    setAuthError(null);
    setIsLoading(true);
    const cleanedEmail = email.trim().toLowerCase();
    const cleanedPassword = password.trim();
    const cleanedFullName = fullName.trim();
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanedEmail, password: cleanedPassword, role, full_name: cleanedFullName })
      });
      const data = await res.json();
      if (res.ok) {
        setAuthError("Registration successful! You can now log in.");
        return true;
      } else {
        setAuthError(data.detail || "Registration failed.");
        return false;
      }
    } catch (e) {
      // Offline fallback
      setAuthError("Offline: Simulated account registered! Please log in.");
      return true;
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
      const res = await fetch(`${API_URL}/auth/google`, { // Google mock endpoint
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
      throw new Error();
    } catch (e) {
      // Offline social mock
      const mockToken = provider === 'google' ? 'mock_listener_token' : 'mock_guest_token';
      localStorage.setItem('token', mockToken);
      setToken(mockToken);
      return true;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
    setAuthError(null);
  };

  const clearError = () => setAuthError(null);

  const isPremium = currentUser?.subscription === 'premium' || currentUser?.role === 'admin' || currentUser?.role === 'studio_admin';

  return (
    <AuthContext.Provider value={{
      token,
      currentUser,
      isLoading,
      authError,
      isPremium,
      login,
      register,
      logout,
      socialLogin,
      clearError,
      fetchCurrentUser
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
