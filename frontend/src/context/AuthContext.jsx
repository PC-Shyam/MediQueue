import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('mq_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await api.get('/auth/me');
        if (res.success) {
          setUser(res.data);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        localStorage.removeItem('mq_token');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    if (res.success) {
      localStorage.setItem('mq_token', res.data.token);
      localStorage.setItem('mq_role', res.data.role);
      localStorage.setItem('mq_displayName', res.data.displayName || res.data.username);
      localStorage.setItem('mq_linkedId', res.data.linkedId || '');
      setUser({
        username: res.data.username,
        role: res.data.role,
        displayName: res.data.displayName,
        linkedId: res.data.linkedId
      });
    }
    return res;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {}
    localStorage.removeItem('mq_token');
    localStorage.removeItem('mq_role');
    localStorage.removeItem('mq_displayName');
    localStorage.removeItem('mq_linkedId');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

