import { useState } from "react";
import { driversApi } from "../../api.js";
import ShiftTimeline from "./ShiftTimeline.jsx";

// A driver's shifts under their row on the Drivers page. With Edit shifts on,
// every change made on the timeline is saved right away (no Save button).
//
// Props:
//   driver    { id, name, shifts }
//   from, to  hours of operation, in minutes
//   editing   the page's Edit shifts switch
//   onSaved   (driver) => void, with the driver as the server returned it
//   selected, onSelect  the page's one highlighted shift: { driverId, key } or null
export default function DriverShifts({ driver, from, to, editing, onSaved, selected, onSelect }) {
  // Shown right away while the save is on its way; dropped once it lands.
  const [pending, setPending] = useState(null);
  const [status, setStatus] = useState(""); // "", "saving", "saved"
  const [error, setError] = useState("");

  async function commit(shifts) {
    setPending(shifts);
    setStatus("saving");
    setError("");
    try {
      onSaved(await driversApi.shifts(driver.id, shifts));
      setStatus("saved");
    } catch (err) {
      const detail = err.data?.shifts;
      setError((Array.isArray(detail) && (detail[0]?.non_field_errors?.[0] || detail[0])) || err.message);
      setStatus("");
    } finally {
      setPending(null); // on failure this puts the last saved week back
    }
  }

  return (
    <div className="driver-shifts">
      <ShiftTimeline
        shifts={pending ?? driver.shifts}
        from={from}
        to={to}
        editing={editing}
        onCommit={commit}
        selected={selected?.driverId === driver.id ? selected.key : null}
        onSelect={(key) => onSelect(key ? { driverId: driver.id, key } : null)}
      />
      {editing && (
        <p className="hint shift-status" aria-live="polite">
          {error ? (
            <span className="error">Couldn't save: {error}</span>
          ) : status === "saving" ? (
            "Saving…"
          ) : status === "saved" ? (
            "Saved"
          ) : driver.shifts.length === 0 ? (
            "No shifts yet. Right-click a day (or press and hold on a phone) to add one."
          ) : null}
        </p>
      )}
    </div>
  );
}
