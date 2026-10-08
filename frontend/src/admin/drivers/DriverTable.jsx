import { Fragment } from "react";
import { ageLabel } from "../../lib/geo.js";
import { formatPhone } from "../../lib/phone.js";
import { formatTime } from "../../lib/time.js";
import DriverShifts from "./DriverShifts.jsx";

// List of drivers with Edit and Remove actions per row.
//
// Props:
//   drivers   array of { id, name, email, phone, color }
//   colors    array of { value, label }, used to name each driver's color
//   onEdit    (driver) => void
//   onRemove  (driver) => void
//   shifts    false, or { from, to, editing, onSaved }: show each driver's
//             shift timeline in a row under theirs (Show shifts)
export default function DriverTable({ drivers, colors, onEdit, onRemove, timeZone, shifts = false }) {
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
            <th>Driver</th>
            <th>UCSB email</th>
            <th>Phone</th>
            <th>Current ride</th>
            <th className="col-actions"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
              <Fragment key={d.id}>
                <tr className={shifts ? "has-shifts" : undefined}>
                  <td className="strong" data-label="Driver">
                    <span className="driver-name">
                      <span
                        className="swatch"
                        style={{ background: d.color }}
                        title={colorName[d.color] || d.color}
                        aria-label={`Color: ${colorName[d.color] || d.color}`}
                        role="img"
                      />
                      {d.name}
                    </span>
                  </td>
                  <td data-label="Email">{d.email}</td>
                  <td className="nowrap" data-label="Phone">{formatPhone(d.phone) || <span className="muted">—</span>}</td>
                  <td data-label="Ride">
                    <CurrentRides rides={d.current_rides} location={d.location} timeZone={timeZone} />
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
                {shifts && (
                  <tr className="shift-row">
                    <td colSpan={5}>
                      <DriverShifts driver={d} {...shifts} />
                    </td>
                  </tr>
                )}
              </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// What the driver is doing right now: their ride that's on the way, and how
// fresh their location is. The rider link shows where they are on the map.
// Every ride the driver has on the way (riders can share the cart).
function CurrentRides({ rides, location, timeZone }) {
  if (!rides?.length) return <span className="muted">Not on a ride</span>;
  return (
    <span className="current-ride">
      {rides.map((ride) => (
        <span key={ride.id} className="current-ride-item">
          <span>
            <strong>{ride.rider_name}</strong> · {formatTime(ride.pickup_time, timeZone)} ·{" "}
            <a href={`/r/${ride.link_token}`} target="_blank" rel="noreferrer">Rider page</a>
          </span>
          <span className="current-ride-route">
            {ride.pickup_name} → {ride.dropoff_name}
          </span>
        </span>
      ))}
      <span className={`current-ride-location${location?.live ? " live" : ""}`}>
        {location ? (
          <>
            {location.live ? "● Location live" : `Location ${ageLabel(location.age_seconds)}`}
            {!location.on_map && " (off map)"}
          </>
        ) : (
          <span className="muted">No location yet</span>
        )}
      </span>
    </span>
  );
}
