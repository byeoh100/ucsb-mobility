import { useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { authApi } from "../api.js";
import { canOpen, homeForRole, useAuth } from "../auth/AuthProvider.jsx";
import GoogleButton from "../auth/GoogleButton.jsx";
import MobileLayout from "../layouts/MobileLayout.jsx";

// Only follow ?next= to paths on this site.
// Only follow ?next= to plain paths on this site. Backslashes are refused
// too: browsers treat "/\\example.com" like "//example.com".
function safeNext(value) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : null;
}

export default function SignIn() {
  const { user, config, applySession } = useAuth();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Return to the page that asked for sign-in, if this role can use it;
  // otherwise go to the role's own home page.
  const next = safeNext(params.get("next"));
  const target = user ? (next && canOpen(user.role, next) ? next : homeForRole(user.role)) : null;

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
    <MobileLayout title="UCSB Mobility Tracker">
      <div className="stack">
        <h1>Sign in</h1>
        <p className="muted">Drivers and dispatch sign in with their UCSB Google account.</p>

        {config.google_client_id ? (
          <GoogleButton clientId={config.google_client_id} onCredential={(c) => finish(authApi.google(c))} />
        ) : (
          <p className="notice">Google sign-in isn't set up yet. Set GOOGLE_CLIENT_ID on the server.</p>
        )}

        {config.backup_login && (
          <BackupSignIn disabled={busy} onSubmit={(username, password) => finish(authApi.backup(username, password))} />
        )}

        {config.dev_login && <DevSignIn disabled={busy} onSubmit={(email) => finish(authApi.dev(email))} />}

        {busy && <p className="muted">Signing in…</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </MobileLayout>
  );
}

// Backup sign-in, for when Google or UCSB sign-in isn't working. Only shown
// while dispatch has a backup password set on the server.
function BackupSignIn({ onSubmit, disabled }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <details className="backup-login">
      <summary>Can't sign in with Google?</summary>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(username, password);
        }}
      >
        <p className="hint">Use the backup account dispatch gave you.</p>
        <label className="field">
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
        </label>
        <label className="field">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button className="button" type="submit" disabled={disabled || !username || !password}>
          Sign in
        </button>
      </form>
    </details>
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
