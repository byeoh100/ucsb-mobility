import { useState } from "react";
import { ridesApi } from "../api.js";
import CampusMap, { LocationDot } from "../components/CampusMap.jsx";
import { formatPhone } from "../lib/phone.js";
import { formatTime } from "../lib/time.js";

// A current ride (on the way): who, where, the map, notes, and Mark complete.
// Being in Current means "on the way", so there's no On the way / Undo; the ✕
// takes the ride back out of Current (the rider's page goes back to waiting).
//
// Props:
//   ride       the ride
//   timeZone   campus time zone
//   onChanged  () => void, after an action, to refresh the list
//   you        { x, y, onMap } the driver's own position on the map, if known
//   sharing    location-sharing state
export default function RideCard({ ride, timeZone, onChanged, you, sharing }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useAction(ride, onChanged, setBusy, setError);

  return (
    <article className="ride-card ride-card-current">
      <div className="ride-card-top">
        <span className="ride-card-time">{formatTime(ride.pickup_time, timeZone)}</span>
        <RiderConfirmed confirmed={ride.rider_confirmed} />
        <button
          className="remove-current"
          onClick={() => run(ridesApi.unstart)}
          disabled={busy}
          aria-label={`Remove ${ride.rider_name} from current rides`}
          title="Remove from current rides"
        >
          ✕
        </button>
      </div>

      <div className="ride-card-rider">
        <span className="ride-card-name">{ride.rider_name}</span>
        <CallButton ride={ride} />
      </div>

      <RouteLine ride={ride} />

      {sharing && <SharingStatus state={sharing} />}

      <CampusMap
        pickup={ride.pickup_pin}
        dropoff={ride.dropoff_pin}
        note={you && !you.onMap ? "You're outside the map area." : null}
      >
        {you?.onMap && <LocationDot point={you} label="You" />}
      </CampusMap>

      <NotesSection notes={ride.notes} />

      {error && <p className="error" role="alert">{error}</p>}

      {/* The way a ride ends (if never tapped, it ends 60 min after pickup). */}
      <button className="mark-complete-bar" onClick={() => run(ridesApi.complete)} disabled={busy}>
        {busy ? "Saving…" : "✓ Mark complete"}
      </button>
    </article>
  );
}

// Runs a ride action (start, complete, ...) then refreshes the list.
export function useAction(ride, onChanged, setBusy, setError) {
  return async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action(ride.id);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
}

// 👍 Confirmed / ❌ Not confirmed: whether the rider said they'll be there.
export function RiderConfirmed({ confirmed }) {
  return confirmed ? (
    <span className="rider-badge rider-badge-yes">👍 Confirmed</span>
  ) : (
    <span className="rider-badge rider-badge-no">❌ Not confirmed</span>
  );
}

// Round phone button: the only tappable thing on the rider's line.
export function CallButton({ ride }) {
  return (
    <a
      className="call-circle"
      href={`tel:+1${ride.rider_phone}`}
      aria-label={`Call ${ride.rider_name}, ${formatPhone(ride.rider_phone)}`}
      title={`Call ${formatPhone(ride.rider_phone)}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z" />
      </svg>
    </a>
  );
}

// 🟢 Library → 🔴 Bren Hall (same colors as the map pins)
export function RouteLine({ ride }) {
  return (
    <p className="route-line">
      <span className="legend legend-pickup">{ride.pickup_name}</span>
      <span className="route-arrow" aria-label="to">→</span>
      <span className="legend legend-dropoff">{ride.dropoff_name}</span>
    </p>
  );
}

// Always shown under the map, so drivers can read notes while looking at it.
export function NotesSection({ notes }) {
  return (
    <section className="notes-section">
      <h3 className="notes-heading">Notes</h3>
      {notes ? <p className="ride-notes">{notes}</p> : <p className="muted">No notes</p>}
    </section>
  );
}

const SHARING_MESSAGES = {
  locating: ["muted", "Finding your location…"],
  slow: ["warn", "Still finding your location. If your phone asked to share your location, tap Allow."],
  sharing: ["ok", "Sharing your location with the rider"],
  denied: ["warn", "Location is blocked. Allow location for this site so your rider can see you coming."],
  unavailable: ["warn", "Can't get your location right now. Your rider will still see that you're on the way."],
};

function SharingStatus({ state }) {
  const message = SHARING_MESSAGES[state];
  if (!message) return null;
  return <p className={`sharing-status sharing-${message[0]}`} role="status">{message[1]}</p>;
}
