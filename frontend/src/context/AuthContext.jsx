// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);   // { user_id, full_name, role, roll_number, email }
  const [token, setToken]     = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const storedUser  = localStorage.getItem('ss_user');
      const storedToken = localStorage.getItem('ss_token');
      if (storedUser && storedToken) {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      }
    } catch {
      // corrupt storage — clear it
      localStorage.removeItem('ss_user');
      localStorage.removeItem('ss_token');
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback((userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('ss_user',  JSON.stringify(userData));
    localStorage.setItem('ss_token', authToken);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('ss_user');
    localStorage.removeItem('ss_token');
  }, []);

  const isAdmin     = user?.role === 'Admin';
  const isProfessor = user?.role === 'Professor';
  const isStudent   = user?.role === 'Student';

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      login, logout,
      isAdmin, isProfessor, isStudent,
      isLoggedIn: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
