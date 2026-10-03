import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "../api.js";

// Holds who's signed in (and their role) for the whole app.
// `user` is undefined while loading, null when signed out.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [config, setConfig] = useState({ google_client_id: "", dev_login: false, time_zone: "America/Los_Angeles" });
  const [error, setError] = useState("");

  const applySession = useCallback((data) => {
    setUser(data.user);
    setConfig(data.config);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applySession(await authApi.session());
      setError("");
    } catch (err) {
      setUser(null);
      setError(err.message);
    }
  }, [applySession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    applySession(await authApi.signOut());
  }, [applySession]);

  return (
    <AuthContext.Provider value={{ user, config, error, applySession, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Where each role lands after signing in.
export function homeForRole(role) {
  if (role === "admin") return "/admin/rides";
  if (role === "driver") return "/driver";
  return "/";
}
