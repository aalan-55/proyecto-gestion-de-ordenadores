import React, { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "../utils/apiClient.js";

const AuthContext = createContext(null);

const STORAGE_KEY = "gestion-ordenadores-auth";

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setToken(parsed.token);
        setUser(parsed.user);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const saveSession = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ token: newToken, user: newUser })
    );
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  const login = async (username, password) => {
    const data = await apiRequest("/login", {
      method: "POST",
      body: { username, password }
    });
    if (!data || !data.token || !data._user) {
      throw new Error("Respuesta de login inválida.");
    }
    saveSession(data.token, data._user);
    return data._user;
  };

  const register = async (payload) => {
    await apiRequest("/register", {
      method: "POST",
      body: payload
    });
  };

  const fetchMe = async () => {
    if (!token) return null;
    const me = await apiRequest("/me", { token });
    setUser(me);
    saveSession(token, me);
    return me;
  };

  const changePassword = async (newPassword) => {
    if (!token) throw new Error("No hay sesión activa.");
    await apiRequest("/update", {
      method: "PATCH",
      token,
      body: { newPassword }
    });
  };

  const value = {
    token,
    user,
    loading,
    login,
    logout,
    register,
    fetchMe,
    changePassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}

