import { useState } from "react";
import { formatPhone } from "../../lib/phone.js";
import ShiftStatus from "./ShiftStatus.jsx";
import ShiftTimeline from "./ShiftTimeline.jsx";
import { useShiftEditing, useShiftSaver } from "./useShiftEditing.js";

// The driver modal: who they are, how many rides they've given, and their
// weekly shifts (editable with the Edit shifts switch, saved as you go).
//
// Its title is <ProfileHeader> (below), which opens the details form.
//
// Props:
//   driver     { id, name, email, phone, color, shifts, ride_counts }
//   from, to   hours of operation, in minutes
//   onSaved    (driver) => void, after a shift change is saved
//   onRemove   () => void: ask to remove the driver
//   onClose    () => void
export default function DriverProfile({ driver, from, to, onSaved, onRemove, onClose }) {
  const [editing, setEditing] = useState(false);
  const saver = useShiftSaver(onSaved);
  const edit = useShiftEditing({
    from, to, editing,
    weekOf: () => saver.weekOf(driver),
    save: saver.save,
  });
  const counts = driver.ride_counts ?? { week: 0, total: 0 };

  return (
    <div className="stack driver-profile">
      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-label">This week</span>
          <span className="stat-value">{counts.week}</span>
          <span className="stat-unit">{counts.week === 1 ? "ride" : "rides"}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">All time</span>
          <span className="stat-value">{counts.total}</span>
          <span className="stat-unit">{counts.total === 1 ? "ride" : "rides"}</span>
        </div>
      </div>

      <div className="profile-section-head">
        <h3>Weekly shifts</h3>
        <label className="switch">
          <input type="checkbox" role="switch" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          Edit shifts
        </label>
      </div>
      <ShiftTimeline driver={driver} from={from} to={to} editing={editing} edit={edit} />
      <ShiftStatus
        editing={editing}
        saver={saver}
        empty={driver.shifts.length === 0}
      />

      <div className="modal-actions">
        <button type="button" className="button-quiet button-quiet-danger actions-left" onClick={onRemove}>
          Remove driver
        </button>
        <button type="button" className="button" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// The modal's title: color, name, email and phone in one line. Pointing at it
// shows "Edit"; clicking it opens the details form.
export function ProfileHeader({ driver, onEdit }) {
  return (
    <button type="button" className="profile-head" onClick={onEdit} title="Edit details">
      <span className="swatch" style={{ background: driver.color }} aria-hidden="true" />
      <span className="profile-name">{driver.name}</span>
      <span className="profile-detail">{driver.email}</span>
      {driver.phone && <span className="profile-detail">{formatPhone(driver.phone)}</span>}
      <span className="profile-edit-hint" aria-hidden="true">✎ Edit</span>
      <span className="visually-hidden">, edit details</span>
    </button>
  );
}
