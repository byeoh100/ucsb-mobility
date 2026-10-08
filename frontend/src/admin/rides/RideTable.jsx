import { Fragment, useState } from "react";
import { formatPhone } from "../../lib/phone.js";
import { formatTime } from "../../lib/time.js";

export const STATUS_LABELS = {
  not_confirmed: "Not started", // the driver hasn't set off yet (not about the rider)
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

// Archived rides are all "completed", so the read-only (archive) table shows
// when the driver actually started instead.
const STARTED_COLUMN = {
  key: "started",
  label: "Driver started",
  className: "c-status",
  value: (r) => r.started_at ?? "~", // "~" sorts never-started rides last
};

function columnsFor(readOnly) {
  return readOnly ? COLUMNS.map((c) => (c.key === "status" ? STARTED_COLUMN : c)) : COLUMNS;
}

export function sortRides(rides, { key, dir }, readOnly = false) {
  const column = columnsFor(readOnly).find((c) => c.key === key) ?? COLUMNS[0];
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
//   readOnly   archive mode: no link or Edit columns; "Driver started" replaces Status
export default function RideTable({ rides, timeZone, sort, onSort, onEdit, readOnly = false }) {
  const columns = columnsFor(readOnly);
  const sorted = sortRides(rides, sort, readOnly);
  const columnCount = columns.length + 1 + (readOnly ? 0 : 2); // +1: Notes
  // Rides whose notes are open (a small dropdown under the row).
  const [openNotes, setOpenNotes] = useState(() => new Set());
  const toggleNotes = (id) =>
    setOpenNotes((open) => {
      const next = new Set(open);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  function clickHeader(key) {
    onSort(sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  return (
    <div className="table-wrap">
      <table className={`table ride-table${readOnly ? " read-only" : ""}`}>
        <colgroup>
          {columns.map((c) => (
            <Fragment key={c.key}>
              <col className={c.className} />
              {c.key === "email" && <col className="c-notes" />}
            </Fragment>
          ))}
          {!readOnly && <col className="c-link" />}
          {!readOnly && <col className="c-actions" />}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort.key === c.key;
              return (
                <Fragment key={c.key}>
                  <th aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button className="sort-button" onClick={() => clickHeader(c.key)}>
                      {c.label}
                      <span className={`sort-arrow${active ? " active" : ""}`} aria-hidden="true">
                        {active && sort.dir === "desc" ? "▼" : "▲"}
                      </span>
                    </button>
                  </th>
                  {c.key === "email" && <th className="plain">Notes</th>}
                </Fragment>
              );
            })}
            {!readOnly && <th className="plain">Rider link</th>}
            {!readOnly && <th className="plain"><span className="visually-hidden">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const rowStyle = r.driver_color
              ? { boxShadow: `inset 4px 0 0 ${r.driver_color}`, background: `${r.driver_color}12` }
              : undefined;
            const notesOpen = openNotes.has(r.id);
            return (
              <Fragment key={r.id}>
                <tr
                  // Dim finished rides on the live list; in the archive they're all finished.
                  className={
                    [!readOnly && r.status === "completed" && "is-completed", notesOpen && "notes-open"]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  style={rowStyle}
                >
                  <td className="nowrap strong" data-label="Time">{formatTime(r.pickup_time, timeZone)}</td>
                  <td className="strong" data-label="Rider">
                    {r.rider_name}
                    {r.series && (
                      <span className="series-badge" title="Repeating ride" aria-label="Repeating ride" role="img">
                        ↻
                      </span>
                    )}
                  </td>
                  <td className="nowrap" data-label="Phone">{formatPhone(r.rider_phone)}</td>
                  <td className="email" data-label="Email">
                    {r.rider_email ? <EmailBreak email={r.rider_email} /> : <span className="muted">—</span>}
                  </td>
                  <td className={`notes-cell${r.notes ? "" : " empty"}`} data-label="Notes">
                    {r.notes && (
                      <button
                        className="notes-toggle"
                        onClick={() => toggleNotes(r.id)}
                        aria-expanded={notesOpen}
                        aria-controls={`notes-${r.id}`}
                        aria-label={notesOpen ? "Hide notes" : "Show notes"}
                        title={notesOpen ? "Hide notes" : "Show notes"}
                      >
                        <span aria-hidden="true">{notesOpen ? "▴" : "▾"}</span>
                      </button>
                    )}
                  </td>
                  <td data-label="From">{r.pickup_name}</td>
                  <td data-label="To">{r.dropoff_name}</td>
                  <td data-label="Driver">
                    {r.driver_name ? (
                      <>
                        <span className="swatch swatch-small" style={{ background: r.driver_color }} aria-hidden="true" />
                        {r.driver_name}
                      </>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                  </td>
                  <td className="nowrap" data-label={readOnly ? "Started" : "Status"}>
                    {readOnly ? (
                      r.started_at ? formatTime(r.started_at, timeZone) : <span className="muted">Never started</span>
                    ) : (
                      <span className={`status status-${r.status}`}>{STATUS_LABELS[r.status] ?? r.status}</span>
                    )}
                    {r.rider_confirmed && (
                      <span className="rider-confirmed" title="Rider confirmed" aria-label="Rider confirmed" role="img">
                        👍
                      </span>
                    )}
                  </td>
                  {!readOnly && (
                    <td className="nowrap" data-label="Link">
                      <RideLinkCell token={r.link_token} />
                    </td>
                  )}
                  {!readOnly && (
                    <td className="col-actions">
                      <button className="button-quiet button-small" onClick={() => onEdit(r)} aria-label={`Edit ride for ${r.rider_name}`}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
                {r.notes && notesOpen && (
                  <tr className="notes-row" id={`notes-${r.id}`} style={rowStyle}>
                    <td colSpan={columnCount}>
                      <span className="notes-label">Notes</span>
                      <span className="notes-text">{r.notes}</span>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
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
      <a className="button-quiet button-small" href={`/r/${token}`} target="_blank" rel="noreferrer">Open</a>
      <button
        className={`button-quiet icon-only${copied ? " copied" : ""}`}
        onClick={copy}
        title={copied ? "Copied" : "Copy rider link"}
        aria-label={copied ? "Copied" : "Copy rider link"}
      >
        {copied ? <CheckIcon /> : <LinkIcon />}
      </button>
    </span>
  );
}

// Chain-link and check icons (stroke icons, drawn in the button's text color).
function LinkIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
