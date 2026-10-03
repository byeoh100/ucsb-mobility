import { ageLabel } from "../../lib/geo.js";
import { formatPhone } from "../../lib/phone.js";
import { formatTime } from "../../lib/time.js";

// List of drivers with Edit and Remove actions per row.
//
// Props:
//   drivers   array of { id, name, email, phone, color }
//   colors    array of { value, label }, used to name each driver's color
//   onEdit    (driver) => void
//   onRemove  (driver) => void
export default function DriverTable({ drivers, colors, onEdit, onRemove, timeZone }) {
  const colorName = Object.fromEntries(colors.map((c) => [c.value, c.label]));

  if (drivers.length === 0) {
    return (
      <div className="empty-state">
        <p>No drivers yet.</p>
        <p className="muted">Drivers you add here can sign in with their UCSB Google account.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="col-color">Color</th>
            <th>Name</th>
            <th>UCSB email</th>
            <th>Phone</th>
            <th>Current ride</th>
            <th className="col-actions"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.id}>
              <td className="col-color">
                <span
                  className="swatch"
                  style={{ background: d.color }}
                  title={colorName[d.color] || d.color}
                  aria-label={colorName[d.color] || d.color}
                  role="img"
                />
              </td>
              <td className="strong">{d.name}</td>
              <td>{d.email}</td>
              <td className="nowrap">{formatPhone(d.phone) || <span className="muted">—</span>}</td>
              <td>
                <CurrentRide ride={d.current_ride} location={d.location} timeZone={timeZone} />
              </td>
              <td className="col-actions">
                <button className="button-quiet" onClick={() => onEdit(d)} aria-label={`Edit ${d.name}`}>
                  Edit
                </button>
                <button
                  className="button-quiet button-quiet-danger"
                  onClick={() => onRemove(d)}
                  aria-label={`Remove ${d.name}`}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// What the driver is doing right now: their ride that's on the way, and how
// fresh their location is. The rider link shows where they are on the map.
function CurrentRide({ ride, location, timeZone }) {
  if (!ride) return <span className="muted">—</span>;
  return (
    <span className="current-ride">
      <span>
        <strong>{ride.rider_name}</strong> · {formatTime(ride.pickup_time, timeZone)}
      </span>
      <span className="current-ride-route">
        {ride.pickup_name} → {ride.dropoff_name}
      </span>
      <span className={`current-ride-location${location?.live ? " live" : ""}`}>
        {location ? (
          <>
            {location.live ? "● Location live" : `Location ${ageLabel(location.age_seconds)}`}
            {!location.on_map && " (off map)"} ·{" "}
          </>
        ) : (
          <span className="muted">No location yet · </span>
        )}
        <a href={`/r/${ride.link_token}`} target="_blank" rel="noreferrer">Rider page</a>
      </span>
    </span>
  );
}
