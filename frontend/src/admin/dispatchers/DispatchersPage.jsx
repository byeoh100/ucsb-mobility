import { useCallback, useEffect, useState } from "react";
import { dispatchersApi } from "../../api.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";

// Admin → Dispatchers: who can use these dispatch pages. Dispatchers manage
// this list themselves, so the program doesn't depend on the developer.
export default function DispatchersPage() {
  const { config, refresh } = useAuth();
  const [dispatchers, setDispatchers] = useState(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [addError, setAddError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(async () => {
    try {
      setDispatchers(await dispatchersApi.list());
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setAddError("");
    try {
      await dispatchersApi.add(email.trim());
      setEmail("");
      await load();
    } catch (err) {
      setAddError(err.data?.email?.[0] || err.message);
    } finally {
      setBusy(false);
    }
  }

  const onlyOne = dispatchers?.length === 1;

  return (
    <section className="stack">
      <div>
        <h1>
          Dispatchers {dispatchers && <span className="count">{dispatchers.length}</span>}
        </h1>
        <p className="muted archive-note">
          Dispatchers can use these pages: rides, drivers, the archive, and this list. They sign in with their UCSB
          Google account.
        </p>
      </div>

      <form className="add-dispatcher" onSubmit={add} noValidate>
        <label className="field">
          Add a dispatcher
          <span className="add-dispatcher-row">
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setAddError("");
              }}
              placeholder="name@ucsb.edu"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button className="button" type="submit" disabled={busy || !email.trim()}>
              {busy ? "Adding…" : "Add"}
            </button>
          </span>
        </label>
        {addError && <p className="field-error">{addError}</p>}
      </form>

      {error && (
        <p className="error" role="alert">
          {error} <button className="button-quiet" onClick={load}>Try again</button>
        </p>
      )}
      {dispatchers === null && !error && <p className="muted">Loading…</p>}

      {dispatchers && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>UCSB email</th>
                <th>Added</th>
                <th>Last signed in</th>
                <th className="col-actions"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {dispatchers.map((d) => (
                <tr key={d.id}>
                  <td className="strong" data-label="Email">
                    <span className="cell-value">
                      {d.email} {d.is_you && <span className="you-tag">you</span>}
                    </span>
                  </td>
                  <td data-label="Added">{formatDate(d.created_at, config.time_zone)}</td>
                  <td data-label="Signed in">
                    {d.last_sign_in ? formatDate(d.last_sign_in, config.time_zone) : <span className="muted">Not yet</span>}
                  </td>
                  <td className="col-actions">
                    <button
                      className="button-quiet button-quiet-danger"
                      onClick={() => setRemoving(d)}
                      disabled={onlyOne}
                      title={onlyOne ? "Add another dispatcher before removing the last one" : undefined}
                      aria-label={`Remove ${d.email}`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {config.backup_login && (
        <p className="hint">
          The backup "dispatch" sign-in isn't listed here; it's switched on or off in the server settings.
        </p>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${removing.email}?` : ""}
        confirmLabel="Remove dispatcher"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await dispatchersApi.remove(removing.id);
          if (removing.is_you) {
            await refresh(); // you're no longer a dispatcher: leave these pages
            window.location.assign("/");
            return;
          }
          await load();
        }}
      >
        {removing?.is_you ? (
          <p>
            <strong>This is you.</strong> You'll lose access to the dispatch pages right away.
          </p>
        ) : (
          <p>They'll lose access to the dispatch pages right away.</p>
        )}
      </ConfirmDialog>
    </section>
  );
}

// In campus time, like every other date in the app.
function formatDate(iso, timeZone) {
  return new Date(iso).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" });
}
