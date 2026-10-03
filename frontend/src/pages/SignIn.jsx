import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { authApi } from "../api.js";
import { homeForRole, useAuth } from "../auth/AuthProvider.jsx";
import GoogleButton from "../auth/GoogleButton.jsx";
import MobileLayout from "../layouts/MobileLayout.jsx";

// Only follow ?next= to paths on this site.
function safeNext(value) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export default function SignIn() {
  const { user, config, applySession } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const target = user ? safeNext(params.get("next")) || homeForRole(user.role) : null;

  // Once signed in, the render below redirects; this only handles errors.
  async function finish(promise) {
    setBusy(true);
    setError("");
    try {
      applySession(await promise);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (user === undefined) return <p className="page-status">Loading…</p>;
  if (user) return <Navigate to={target} replace />;

  return (
    <MobileLayout title="Cart Dispatch">
      <div className="stack">
        <h1>Sign in</h1>
        <p className="muted">Drivers and dispatch sign in with their UCSB Google account.</p>

        {config.google_client_id ? (
          <GoogleButton clientId={config.google_client_id} onCredential={(c) => finish(authApi.google(c))} />
        ) : (
          <p className="notice">Google sign-in isn't set up yet. Set GOOGLE_CLIENT_ID on the server.</p>
        )}

        {config.dev_login && <DevSignIn disabled={busy} onSubmit={(email) => finish(authApi.dev(email))} />}

        {busy && <p className="muted">Signing in…</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </MobileLayout>
  );
}

// Local testing only (DEV_LOGIN=true): sign in as any email to try each role.
function DevSignIn({ onSubmit, disabled }) {
  const [email, setEmail] = useState("");
  return (
    <form
      className="dev-login stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email);
      }}
    >
      <p className="muted">Development sign-in (DEV_LOGIN is on)</p>
      <input type="email" placeholder="anyone@ucsb.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="button-quiet" type="submit" disabled={disabled || !email}>
        Sign in as this email
      </button>
    </form>
  );
}
