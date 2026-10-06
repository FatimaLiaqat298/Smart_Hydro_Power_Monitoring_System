'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';

// =========================================
// Auth Context — manages login state globally in Next.js
// =========================================

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // currently logged-in user
  const [loading, setLoading] = useState(true);  // true until token checked
  const router = useRouter();

  // Return to sign-in only after the API client cannot refresh the session.
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      router.replace('/login');
    };
    window.addEventListener('shpmfs:session-expired', handleSessionExpired);
    return () => window.removeEventListener('shpmfs:session-expired', handleSessionExpired);
  }, [router]);

  // Always validate persisted credentials; cached profile data is not proof of a valid session.
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        if (isMounted) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.get('/auth/me');
        const profile = res.data?.data || res.data;
        localStorage.setItem('user', JSON.stringify(profile));
        if (isMounted) setUser(profile);
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          if (isMounted) {
            setUser(null);
            router.replace('/login');
          }
        } else if (isMounted) {
          try {
            const savedUser = localStorage.getItem('user');
            setUser(savedUser ? JSON.parse(savedUser) : null);
          } catch {
            localStorage.removeItem('user');
            setUser(null);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    restoreSession();
    return () => {
      isMounted = false;
    };
  }, [router]);

  // Login function — called from Login page
  const login = async (identifier, password) => {
    const payload = { email: identifier, password };
    const res = await api.post('/auth/login', payload);
    const data = res.data?.data || res.data;
    const token = data.access_token || data.token;
    const refreshToken = data.refresh_token;
    const userData = data.user;

    // Save to localStorage
    if (token) localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    }

    // Redirect based on user role
    if (userData?.role === 'engineer') router.push('/data-entry');
    else router.push('/dashboard');
  };

  // Logout function
  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    }
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
