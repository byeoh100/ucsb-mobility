import { useState } from "react";
import { formatPhone } from "../../lib/phone.js";
import { formatTime } from "../../lib/time.js";

export const STATUS_LABELS = {
  not_confirmed: "Not confirmed",
  on_the_way: "On the way",
  completed: "Completed",
};
const STATUS_ORDER = { not_confirmed: 0, on_the_way: 1, completed: 2 };

// Every column but the link is sortable. `value` is what sorting compares.
// `className` sets the column width (styles.css), identical in both tables so
// the unassigned list lines up with the main one.
const COLUMNS = [
  { key: "time", label: "Time", className: "c-time", value: (r) => r.pickup_time },
  { key: "rider", label: "Rider", className: "c-rider", value: (r) => r.rider_name.toLowerCase() },
  { key: "phone", label: "Phone", className: "c-phone", value: (r) => r.rider_phone },
  { key: "email", label: "UCSB email", className: "c-email", value: (r) => r.rider_email },
  { key: "from", label: "From", className: "c-place", value: (r) => r.pickup_name.toLowerCase() },
  { key: "to", label: "To", className: "c-place", value: (r) => r.dropoff_name.toLowerCase() },
  { key: "driver", label: "Driver", className: "c-driver", value: (r) => (r.driver_name ?? "").toLowerCase() },
  { key: "status", label: "Status", className: "c-status", value: (r) => STATUS_ORDER[r.status] ?? 9 },
];

export function sortRides(rides, { key, dir }) {
  const column = COLUMNS.find((c) => c.key === key) ?? COLUMNS[0];
  const sign = dir === "desc" ? -1 : 1;
  return [...rides].sort((a, b) => {
    const x = column.value(a);
    const y = column.value(b);
    if (x < y) return -sign;
    if (x > y) return sign;
    return a.pickup_time < b.pickup_time ? -1 : a.pickup_time > b.pickup_time ? 1 : 0; // ties: by time
  });
}

// Rides as a sortable table, color-coded by driver.
//
// Props:
//   rides      rides to show (already filtered)
//   timeZone   campus time zone for displaying times
//   sort       { key, dir } and onSort(nextSort), shared so both tables sort alike
//   onEdit     (ride) => void   (deleting happens from the edit dialog)
export default function RideTable({ rides, timeZone, sort, onSort, onEdit }) {
  const columns = COLUMNS;
  const sorted = sortRides(rides, sort);

  function clickHeader(key) {
    onSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  return (
    <div className="table-wrap">
      <table className="table ride-table">
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} className={c.className} />
          ))}
          <col className="c-link" />
          <col className="c-actions" />
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button className="sort-button" onClick={() => clickHeader(c.key)}>
                    {c.label}
                    <span className={`sort-arrow${active ? " active" : ""}`} aria-hidden="true">
                      {active && sort.dir === "desc" ? "▼" : "▲"}
                    </span>
                  </button>
                </th>
              );
            })}
            <th>Rider link</th>
            <th><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.id}
              className={r.status === "completed" ? "is-completed" : undefined}
              style={
                r.driver_color
                  ? { boxShadow: `inset 4px 0 0 ${r.driver_color}`, background: `${r.driver_color}12` }
                  : undefined
              }
            >
              <td className="nowrap strong">{formatTime(r.pickup_time, timeZone)}</td>
              <td className="strong">{r.rider_name}</td>
              <td className="nowrap">{formatPhone(r.rider_phone)}</td>
              <td className="email">
                <EmailBreak email={r.rider_email} />
              </td>
              <td>{r.pickup_name}</td>
              <td>{r.dropoff_name}</td>
              <td>
                {r.driver_name ? (
                  <>
                    <span className="swatch swatch-small" style={{ background: r.driver_color }} aria-hidden="true" />
                    {r.driver_name}
                  </>
                ) : (
                  <span className="muted">Unassigned</span>
                )}
              </td>
              <td className="nowrap">
                <span className={`status status-${r.status}`}>{STATUS_LABELS[r.status] ?? r.status}</span>
                {r.rider_confirmed && (
                  <span className="rider-confirmed" title="Rider confirmed" aria-label="Rider confirmed" role="img">
                    👍
                  </span>
                )}
              </td>
              <td className="nowrap">
                <RideLinkCell token={r.link_token} />
              </td>
              <td className="col-actions">
                <button className="button-quiet button-small" onClick={() => onEdit(r)} aria-label={`Edit ride for ${r.rider_name}`}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Open the rider's page, or copy its link to send to them.
function RideLinkCell({ token }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/r/${token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url); // clipboard blocked: let them copy by hand
    }
  }

  return (
    <span className="link-cell">
      <a href={`/r/${token}`} target="_blank" rel="noreferrer">Open</a>
      <button className="button-quiet button-small" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </span>
  );
}

// Lets a long email wrap right after the "@" instead of mid-word.
function EmailBreak({ email }) {
  const at = email.indexOf("@");
  if (at === -1) return email;
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  );
}
