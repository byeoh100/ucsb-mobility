import { useRef, useState } from "react";
import { formApi } from "../../api.js";
import { formatPhone } from "../../lib/phone.js";
import { formatDayLabel, shiftDate } from "../../lib/time.js";

// Import ride requests from the Google Form's response sheet (.csv).
//   1. Pick the file and how long the rides repeat.
//   2. Preview: every filled slot. LOCK-IN responses repeat weekly; others
//      are one ride on the slot's date. Slots with a problem are left out (a
//      pickup/drop-off that couldn't be split can be typed in); slots already
//      scheduled are left out too.
//   3. Add the checked ones.
// Shown inside a Modal by RidesPage. The rules: backend/rides/form_import.py.
//
// Props: today ("YYYY-MM-DD"), onDone(), onClose()
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MAX_DAYS = 120; // the server's limit on how long a series runs

export default function FormImport({ today, onDone, onClose }) {
  const [file, setFile] = useState(null);
  const [until, setUntil] = useState(shiftDate(today, 70)); // about a quarter
  const [preview, setPreview] = useState(null); // { slots, older }
  const [chosen, setChosen] = useState({}); // key → included
  const [edits, setEdits] = useState({}); // key → { pickup, dropoff }
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadPreview(e) {
    e.preventDefault();
    if (!file) return setError("Choose the response sheet first.");
    setBusy(true);
    setError("");
    try {
      const body = await formApi.preview(await file.text(), until);
      setPreview(body);
      setEdits({});
      setChosen(Object.fromEntries(body.slots.map((s) => [s.key, s.problems.length === 0 && s.new_rides > 0])));
    } catch (err) {
      setError(err.data?.until?.[0] || err.data?.date || err.message);
    } finally {
      setBusy(false);
    }
  }

  // A slot as it'll be sent: with any typed-in locations.
  const withEdits = (s) => ({ ...s, ...edits[s.key] });
  // Problems left after editing: a location problem goes once both are typed.
  const problemsOf = (s) => {
    const e = withEdits(s);
    return s.problems.filter((p) => !(p === s.location_problem && e.pickup?.trim() && e.dropoff?.trim()));
  };

  const slots = preview?.slots ?? [];
  // Slots still blocked by a problem, for the Errors list above the table.
  const errors = slots.filter((s) => problemsOf(s).length > 0);
  const tableRef = useRef(null);
  const [flash, setFlash] = useState(null); // key of the row just jumped to
  const [at, setAt] = useState(null); // key of the error the arrows are on
  const current = errors.findIndex((s) => s.key === at);

  // ‹ › : the previous/next error (wrapping around). After fixing one, "next"
  // goes to the one that followed it.
  function step(by) {
    if (!errors.length) return;
    let i;
    if (current >= 0) i = (current + by + errors.length) % errors.length;
    else {
      // The error we were on was fixed: carry on from where it was in the list.
      const order = slots.map((s) => s.key);
      const from = at ? order.indexOf(at) : -1;
      const after = errors.findIndex((s) => order.indexOf(s.key) > from);
      i = by > 0 ? (after >= 0 ? after : 0) : (after > 0 ? after - 1 : errors.length - 1);
    }
    setAt(errors[i].key);
    jumpTo(errors[i].key);
  }

  // Scroll the table to a slot's row, highlight it briefly, and put the
  // cursor in its pickup box if the locations need typing.
  function jumpTo(key) {
    const row = tableRef.current?.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.querySelector(".import-input")?.focus({ preventScroll: true });
    setFlash(key);
    setTimeout(() => setFlash((k) => (k === key ? null : k)), 1600);
  }
  const included = slots.filter((s) => chosen[s.key] && problemsOf(s).length === 0);
  const rideCount = included.reduce((n, s) => n + s.new_rides, 0);

  async function runImport() {
    setBusy(true);
    setError("");
    try {
      setResult(await formApi.import(included.map(withEdits), until));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="stack">
        <p>
          Added <strong>{result.rides}</strong> {result.rides === 1 ? "ride" : "rides"}
          {result.series > 0 && <> ({result.series} repeating {result.series === 1 ? "ride" : "rides"})</>}.
        </p>
        {result.skipped.length > 0 && (
          <p className="muted">{result.skipped.length} left out: {[...new Set(result.skipped.map((s) => s.reason))].join(" ")}</p>
        )}
        <div className="modal-actions">
          <button className="button" onClick={onDone}>Done</button>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <form className="stack" onSubmit={loadPreview} noValidate>
        <p className="hint">
          In the form's Google Sheet: File → Download → Comma-separated values (.csv). Importing the same sheet again
          only adds what's new.
        </p>
        <label className="field">
          <span>Response sheet</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files[0] ?? null)} />
        </label>
        <label className="field">
          <span>Repeat each ride weekly until</span>
          <input
            type="date"
            className="date-input"
            value={until}
            min={today}
            max={shiftDate(today, MAX_DAYS)}
            onChange={(e) => e.target.value && setUntil(e.target.value)}
          />
          <span className="hint">Rides can be ended early from the ride's edit dialog (this and later rides).</span>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button" disabled={busy || !file}>{busy ? "Reading…" : "Preview"}</button>
        </div>
      </form>
    );
  }

  // Preview, grouped by rider.
  const riders = [];
  for (const s of slots) {
    const last = riders[riders.length - 1];
    if (last && last.row === s.row) last.slots.push(s);
    else riders.push({ row: s.row, name: s.rider_name, phone: s.rider_phone, slots: [s] });
  }

  return (
    <div className="stack form-import">
      <p>
        {slots.length} {slots.length === 1 ? "time slot" : "time slots"} from {riders.length}{" "}
        {riders.length === 1 ? "rider" : "riders"}. LOCK-IN rides repeat weekly until {formatDayLabel(until)}; the
        rest are one ride on the date given.
      </p>
      {preview.older.length > 0 && (
        <p className="hint">
          Using each rider's newest response; skipped older ones from{" "}
          {preview.older.map((o) => `${o.rider_name || "(no name)"} (row ${o.row})`).join(", ")}.
        </p>
      )}
      {errors.length > 0 && (
        <div className="import-errors" role="group" aria-label="Errors">
          <span className="import-errors-title">
            {errors.length} {errors.length === 1 ? "error" : "errors"}
          </span>
          <button
            type="button"
            className="stepper-button"
            aria-label="Previous error"
            onClick={() => step(-1)}
          >
            ‹
          </button>
          <span className="import-errors-count" aria-live="polite">
            {current >= 0 ? `${current + 1} of ${errors.length}` : `– of ${errors.length}`}
          </span>
          <button type="button" className="stepper-button" aria-label="Next error" onClick={() => step(1)}>
            ›
          </button>
        </div>
      )}
      {slots.length === 0 ? (
        <p className="muted">No rides found in this sheet.</p>
      ) : (
        <div className="table-wrap import-table-wrap" ref={tableRef}>
          <table className="table import-table">
            <thead>
              <tr>
                <th><span className="visually-hidden">Add</span></th>
                <th>Day</th>
                <th>Time</th>
                <th>Pickup</th>
                <th>Drop-off</th>
                <th>When</th>
                <th>Rides</th>
                <th>Notes</th>
              </tr>
            </thead>
            {riders.map((r) => (
              <tbody key={r.row}>
                <tr className="import-rider">
                  <td colSpan={8}>
                    <strong>{r.name || "(no name)"}</strong> <span className="muted">· {formatPhone(r.phone.replace(/\D/g, "").slice(-10)) || r.phone} · row {r.row}</span>
                  </td>
                </tr>
                {r.slots.map((s) => {
                  const problems = problemsOf(s);
                  const e = withEdits(s);
                  const locationFix = Boolean(s.location_problem);
                  const blocked = problems.length > 0 || s.new_rides === 0;
                  return (
                    <tr
                      key={s.key}
                      data-key={s.key}
                      className={[blocked && "import-blocked", flash === s.key && "import-flash"].filter(Boolean).join(" ") || undefined}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Add ${DAYS[s.weekday]} ${s.time ?? ""}`}
                          checked={Boolean(chosen[s.key]) && !blocked}
                          disabled={blocked}
                          onChange={(ev) => setChosen((c) => ({ ...c, [s.key]: ev.target.checked }))}
                        />
                      </td>
                      <td className="nowrap">{DAYS[s.weekday]}</td>
                      <td className="nowrap">{s.time ? s.time.replace(/:00(?= [AP]M)/i, "") : "—"}</td>
                      {locationFix ? (
                        <>
                          <td>
                            <input
                              className="import-input"
                              value={e.pickup}
                              placeholder="Pickup"
                              aria-label="Pickup"
                              onChange={(ev) => {
                                setEdits((x) => ({ ...x, [s.key]: { ...e, pickup: ev.target.value } }));
                                setChosen((c) => ({ ...c, [s.key]: true }));
                              }}
                            />
                          </td>
                          <td>
                            <input
                              className="import-input"
                              value={e.dropoff}
                              placeholder="Drop-off"
                              aria-label="Drop-off"
                              onChange={(ev) => {
                                setEdits((x) => ({ ...x, [s.key]: { ...e, dropoff: ev.target.value } }));
                                setChosen((c) => ({ ...c, [s.key]: true }));
                              }}
                            />
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{s.pickup}</td>
                          <td>{s.dropoff}</td>
                        </>
                      )}
                      <td className="nowrap">
                        {!s.starts ? "—" : s.lock_in ? `Weekly from ${shortDay(s.starts)}` : `${shortDay(s.starts)} only`}
                      </td>
                      <td className="nowrap">
                        {s.new_rides > 0 ? s.new_rides : "—"}
                        {s.existing_rides > 0 && <span className="muted"> ({s.existing_rides} already scheduled)</span>}
                      </td>
                      <td className="import-notes">
                        {problems.map((p) => (
                          <span key={p} className="import-problem">{p}</span>
                        ))}
                        {s.warnings.map((w) => (
                          <span key={w} className="import-warning">{w}</span>
                        ))}
                        {s.notes && <span className="import-note">{s.notes}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="button-quiet actions-left" onClick={() => setPreview(null)} disabled={busy}>
          ← Back
        </button>
        <button type="button" className="button-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="button" onClick={runImport} disabled={busy || rideCount === 0}>
          {busy ? "Adding…" : `Add ${rideCount} ${rideCount === 1 ? "ride" : "rides"}`}
        </button>
      </div>
    </div>
  );
}

// "2026-10-19" → "Oct 19"
const shortDay = (iso) => formatDayLabel(iso).replace(/^\w+, /, "");
