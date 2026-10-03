import { useState } from "react";
import { ridesApi } from "../api.js";
import CampusMap from "../components/CampusMap.jsx";
import { STATUS_LABELS } from "../admin/rides/RideTable.jsx";
import { formatPhone } from "../lib/phone.js";
import { formatTime } from "../lib/time.js";

// Everything a driver needs for one ride: who, where, the map, a call
// button, and (for their own rides today) On the way / Undo.
//
// Props:
//   ride        the ride
//   mine        is it the signed-in driver's ride?
//   canStart    mine, today, and not completed
//   timeZone    campus time zone
//   onChanged   () => void, after On the way / Undo, to refresh the list
//   highlight   "current" | "next" | undefined, for emphasis
//   mapOpen     show the map right away (only the top card does, so the
//               screen isn't two full-size maps tall)
export default function RideCard({ ride, mine, canStart, timeZone, onChanged, highlight, mapOpen = false }) {
  const [busy, setBusy] = useState(false);
  const [showMap, setShowMap] = useState(mapOpen);
  const [error, setError] = useState("");

  async function run(action) {
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
  }

  const onTheWay = ride.status === "on_the_way";

  return (
    <article className={`ride-card${highlight ? ` ride-card-${highlight}` : ""}`}>
      <div className="ride-card-top">
        <span className="ride-card-time">{formatTime(ride.pickup_time, timeZone)}</span>
        {ride.status && <span className={`status status-${ride.status}`}>{STATUS_LABELS[ride.status]}</span>}
      </div>

      <div className="ride-card-rider">
        <span className="ride-card-name">{ride.rider_name}</span>
        {ride.rider_confirmed ? (
          <span className="confirmed-badge">👍 Rider confirmed</span>
        ) : (
          onTheWay && <span className="muted small">Waiting for rider to confirm</span>
        )}
      </div>

      <dl className="ride-card-route">
        <dt>Pick up</dt>
        <dd>{ride.pickup_name}</dd>
        <dt>Drop off</dt>
        <dd>{ride.dropoff_name}</dd>
        {!mine && (
          <>
            <dt>Driver</dt>
            <dd>
              {ride.driver_name ? (
                <>
                  <span className="swatch swatch-small" style={{ background: ride.driver_color }} aria-hidden="true" />
                  {ride.driver_name}
                </>
              ) : (
                <span className="muted">Unassigned</span>
              )}
            </dd>
          </>
        )}
      </dl>

      {showMap ? (
        <CampusMap pickup={ride.pickup_pin} dropoff={ride.dropoff_pin} />
      ) : (
        <button className="button-quiet show-map" onClick={() => setShowMap(true)}>
          Show map{ride.pickup_pin || ride.dropoff_pin ? " (rider marked spots)" : ""}
        </button>
      )}

      <div className="ride-card-actions">
        <a className="button-quiet call-button" href={`tel:+1${ride.rider_phone}`}>
          Call {formatPhone(ride.rider_phone)}
        </a>
        {canStart && !onTheWay && (
          <button className="button otw-button" onClick={() => run(ridesApi.start)} disabled={busy}>
            {busy ? "Starting…" : "On the way"}
          </button>
        )}
        {canStart && onTheWay && (
          <div className="otw-done">
            <span>On the way since {formatTime(ride.started_at, timeZone)}</span>
            <button className="button-quiet" onClick={() => run(ridesApi.unstart)} disabled={busy}>
              Undo
            </button>
          </div>
        )}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
