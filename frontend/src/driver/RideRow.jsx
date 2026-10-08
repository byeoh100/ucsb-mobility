import { useState } from "react";
import { ridesApi } from "../api.js";
import CampusMap from "../components/CampusMap.jsx";
import QuickConfirm from "../components/QuickConfirm.jsx";
import { formatTime } from "../lib/time.js";
import { NotesSection, useAction } from "./RideCard.jsx";

// Compact list row; tap to open. The row already shows time, rider and route,
// so the opened part only adds what's missing:
//   your upcoming ride   map, notes, On the way!
// Your finished rides don't open: they have a small Reopen instead (if the
// driver marked them complete today).
//   someone else's ride  driver, map
//
// Props:
//   ride, expanded, onToggle, timeZone, onChanged
//   showDriver  show the driver's color dot (All rides)
//   mine        it's the signed-in driver's ride
//   canStart    mine, today, not started or finished
//   canReopen   mine, today, marked complete by the driver
export default function RideRow({ ride, expanded, onToggle, showDriver, timeZone, ...props }) {
  if (props.mine && ride.status === "completed") return <DoneRow ride={ride} timeZone={timeZone} {...props} />;
  return (
    <li className={`ride-row${expanded ? " expanded" : ""}`}>
      <button className="ride-row-summary" onClick={onToggle} aria-expanded={expanded}>
        <span className="ride-row-time">{formatTime(ride.pickup_time, timeZone)}</span>
        <span className="ride-row-main">
          <span className="ride-row-name">
            {showDriver && (
              <span
                className={`swatch swatch-small${ride.driver_color ? "" : " swatch-empty"}`}
                style={ride.driver_color ? { background: ride.driver_color } : undefined}
                title={ride.driver_name ?? "Unassigned"}
                aria-hidden="true"
              />
            )}
            {ride.rider_name}
          </span>
          <span className="ride-row-route">
            {ride.pickup_name} → {ride.dropoff_name}
          </span>
        </span>
        <span className="ride-row-chevron" aria-hidden="true">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && <RideDetails ride={ride} timeZone={timeZone} {...props} />}
    </li>
  );
}

function RideDetails({ ride, mine, canStart, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = useAction(ride, onChanged, setBusy, setError);

  let body;
  if (!mine) {
    body = (
      <>
        <p className="row-driver">
          {ride.driver_name ? (
            <>
              <span className="swatch swatch-small" style={{ background: ride.driver_color }} aria-hidden="true" />
              {ride.driver_name}
            </>
          ) : (
            <span className="muted">Unassigned</span>
          )}
        </p>
        <CampusMap pickup={ride.pickup_pin} dropoff={ride.dropoff_pin} />
      </>
    );
  } else {
    body = (
      <>
        <CampusMap pickup={ride.pickup_pin} dropoff={ride.dropoff_pin} />
        <NotesSection notes={ride.notes} />
        {canStart && ride.status === "not_confirmed" && (
          <button className="button otw-button" onClick={() => run(ridesApi.start)} disabled={busy}>
            {busy ? "Starting…" : "On the way!"}
          </button>
        )}
      </>
    );
  }

  return (
    <div className="ride-row-details">
      {body}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

// A finished ride: time, rider, route, and a small Reopen for undoing a
// mistaken Mark complete.
function DoneRow({ ride, timeZone, canReopen, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);
  const run = useAction(ride, onChanged, setBusy, setError);
  return (
    <li className="ride-row ride-row-done">
      <div className="ride-row-summary">
        <span className="ride-row-time">{formatTime(ride.pickup_time, timeZone)}</span>
        <span className="ride-row-main">
          <span className="ride-row-name">{ride.rider_name}</span>
          <span className="ride-row-route">
            {ride.pickup_name} → {ride.dropoff_name}
          </span>
        </span>
        {canReopen ? (
          <button className="button-quiet button-small" onClick={() => setAsking(true)} disabled={busy}>
            Reopen
          </button>
        ) : (
          <span />
        )}
      </div>
      {error && <p className="error row-error" role="alert">{error}</p>}
      <QuickConfirm
        open={asking}
        onClose={() => setAsking(false)}
        title="Reopen?"
        yesLabel={`Yes, reopen ${ride.rider_name}'s ride`}
        onConfirm={() => run(ridesApi.reopen)}
      />
    </li>
  );
}
