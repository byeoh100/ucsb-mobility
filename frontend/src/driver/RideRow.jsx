import { STATUS_LABELS } from "../admin/rides/RideTable.jsx";
import { formatTime } from "../lib/time.js";
import RideCard from "./RideCard.jsx";

// Compact list row; tap to expand into the full RideCard.
//
// Props: ride, expanded, onToggle, showDriver, plus RideCard's props
export default function RideRow({ ride, expanded, onToggle, showDriver, ...cardProps }) {
  return (
    <li className={`ride-row${expanded ? " expanded" : ""}`}>
      <button className="ride-row-summary" onClick={onToggle} aria-expanded={expanded}>
        <span className="ride-row-time">{formatTime(ride.pickup_time, cardProps.timeZone)}</span>
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
            {ride.rider_confirmed && <span aria-label="Rider confirmed" role="img"> 👍</span>}
            {ride.notes && <span className="has-notes" title="Has notes" aria-label="Has notes" role="img"> 📝</span>}
          </span>
          <span className="ride-row-route">
            {ride.pickup_name} → {ride.dropoff_name}
          </span>
        </span>
        {/* Other drivers' rides come without status (the server leaves it out). */}
        {ride.status ? <span className={`status status-${ride.status}`}>{STATUS_LABELS[ride.status]}</span> : <span />}
      </button>
      {expanded && <RideCard ride={ride} {...cardProps} />}
    </li>
  );
}
