import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, setSession, clearSession, getStoredUser, getToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const u = await api("/auth/me");
      setUser(u);
      localStorage.setItem("ni_user", JSON.stringify(u));
      return u;
    } catch {
      clearSession();
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      refresh().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refresh]);

  const login = (token, u) => {
    setSession(token, u);
    setUser(u);
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
