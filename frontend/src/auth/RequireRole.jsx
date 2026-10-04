import { Link, Navigate, useLocation } from "react-router";
import MobileLayout from "../layouts/MobileLayout.jsx";
import { useAuth } from "./AuthProvider.jsx";

// Wraps routes that need a signed-in user with one of the given roles.
// Admins can open every page, since other profiles are slices of theirs.
export default function RequireRole({ roles, children }) {
  const { user, signedOutOnPurpose } = useAuth();
  const location = useLocation();

  if (user === undefined) return <p className="page-status">Loading…</p>;

  if (!user) {
    // Remember where they were (e.g. an expired session), unless they just
    // signed out themselves; then the next person starts fresh.
    if (signedOutOnPurpose) return <Navigate to="/sign-in" replace />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/sign-in?next=${next}`} replace />;
  }

  if (user.role !== "admin" && !roles.includes(user.role)) {
    return (
      <MobileLayout>
        <div className="stack">
          <h1>No access</h1>
          <p>
            You're signed in as <strong>{user.email}</strong>, which doesn't have access to this page.
            If you're a driver or dispatcher, ask an admin to add this email.
          </p>
          <Link to="/" className="button">Go to ride lookup</Link>
        </div>
      </MobileLayout>
    );
  }

  return children;
}
