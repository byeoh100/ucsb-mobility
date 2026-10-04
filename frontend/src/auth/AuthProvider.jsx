import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "../api.js";

// Holds who's signed in (and their role) for the whole app.
// `user` is undefined while loading, null when signed out.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [config, setConfig] = useState({
    google_client_id: "",
    dev_login: false,
    backup_login: false,
    time_zone: "America/Los_Angeles",
    archive_hour: 8,
    archive_retention_days: 30,
    service_hours: { start: "07:00", end: "19:00" },
    dispatch_phone: "",
    privacy_contact_email: "",
  });
  const [error, setError] = useState("");

  // True right after a deliberate sign-out. RequireRole then sends you to a
  // clean sign-in page instead of /sign-in?next=<the page you were on>, so the
  // next person to sign in (say, a driver after dispatch) isn't sent there.
  const [signedOutOnPurpose, setSignedOutOnPurpose] = useState(false);

  const applySession = useCallback((data) => {
    setUser(data.user);
    setConfig(data.config);
    if (data.user) setSignedOutOnPurpose(false);
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
    const data = await authApi.signOut();
    setSignedOutOnPurpose(true);
    applySession(data);
  }, [applySession]);

  return (
    <AuthContext.Provider value={{ user, config, error, applySession, refresh, signOut, signedOutOnPurpose }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Whether a role can use a page; used to ignore a ?next= that would only
// show "No access" (e.g. a driver sent to an admin page).
export function canOpen(role, path) {
  if (path.startsWith("/admin")) return role === "admin";
  if (path.startsWith("/driver")) return role === "driver" || role === "admin";
  return true;
}

// Where each role lands after signing in.
export function homeForRole(role) {
  if (role === "admin") return "/admin/rides";
  if (role === "driver") return "/driver";
  return "/";
}
