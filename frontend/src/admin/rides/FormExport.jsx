import { useState } from "react";
import { formApi } from "../../api.js";
import { formatDayLabel, shiftDate } from "../../lib/time.js";

// Download a week's rides (Monday to Friday) as a .csv in the Google Form's
// response layout: one row per rider, rides in the day slots by time.
// Shown inside a Modal by RidesPage.
//
// Props: date (the day being viewed, "YYYY-MM-DD"), onClose()
export default function FormExport({ date, onClose }) {
  const [day, setDay] = useState(date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monday = shiftDate(day, -weekday);

  async function download() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const leftOut = await formApi.export(monday);
      setNote(
        leftOut > 0
          ? `Downloaded. ${leftOut} ${leftOut === 1 ? "ride didn't" : "rides didn't"} fit: the form has at most 5 rides per rider per day (4 on Fridays).`
          : "Downloaded."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <label className="field">
        <span>Week</span>
        <input type="date" className="date-input" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <span className="hint">
          {formatDayLabel(monday)} to {formatDayLabel(shiftDate(monday, 4))}
        </span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {note && <p className="hint" role="status">{note}</p>}
      <div className="modal-actions">
        <button type="button" className="button-quiet" onClick={onClose}>Close</button>
        <button type="button" className="button" onClick={download} disabled={busy}>
          {busy ? "Preparing…" : "Download .csv"}
        </button>
      </div>
    </div>
  );
}
