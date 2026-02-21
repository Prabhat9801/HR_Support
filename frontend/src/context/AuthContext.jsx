/**
 * Botivate HR Support – Auth Context
 * Manages login/logout, session persistence, role checks.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('botivate_user');
    const token = localStorage.getItem('botivate_token');
    if (stored && token) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const login = async (credentials) => {
    const res = await authAPI.login(credentials);
    const data = res.data;
    localStorage.setItem('botivate_token', data.access_token);
    localStorage.setItem('botivate_user', JSON.stringify(data));
    setUser(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('botivate_token');
    localStorage.removeItem('botivate_user');
    setUser(null);
  };

  const isAuthority = () =>
    user && ['manager', 'hr', 'admin', 'ceo'].includes(user.role);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAuthority }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
