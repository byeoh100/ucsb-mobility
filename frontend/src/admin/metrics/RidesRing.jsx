import { useState } from "react";

// One metrics panel: a ring split by how many rides each driver gave (in
// their color), the total in the middle, and a list of names and counts.
// Pointing at a ring segment highlights that driver's name, and vice versa.
//
// Props:
//   stats   { total, drivers: [{ id, name, color, rides }] }, or null while loading
const SIZE = 220;
const STROKE = 30;
const R = (SIZE - STROKE) / 2 - 6; // leaves room for a highlighted segment to grow
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 2; // px of panel showing between segments

export default function RidesRing({ stats }) {
  const [active, setActive] = useState(null); // driver id being pointed at
  const drivers = stats?.drivers ?? [];
  const total = stats?.total ?? 0;

  // Each driver's arc, clockwise from 12 o'clock, in list order.
  let offset = 0;
  const arcs = drivers.map((d) => {
    const length = (d.rides / total) * CIRCUMFERENCE;
    const arc = { ...d, start: offset, length: drivers.length > 1 ? Math.max(length - GAP, 0.5) : length };
    offset += length;
    return arc;
  });
  const point = (id) => ({ onPointerEnter: () => setActive(id), onPointerLeave: () => setActive(null) });

  return (
      <div className="metrics-body">
        <div className="ring-wrap">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ring" role="img" aria-label={`${total} rides`}>
            <circle className="ring-track" cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} />
            {/* Rotated so the first segment starts at 12 o'clock */}
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {arcs.map((a) => (
                <circle
                  key={a.id}
                  className={`ring-segment${active === a.id ? " active" : active != null ? " dim" : ""}`}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  stroke={a.color}
                  strokeWidth={active === a.id ? STROKE + 10 : STROKE}
                  strokeDasharray={`${a.length} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-a.start}
                  {...point(a.id)}
                >
                  <title>{`${a.name}: ${a.rides} ${a.rides === 1 ? "ride" : "rides"}`}</title>
                </circle>
              ))}
            </g>
          </svg>
          <div className="ring-center" aria-hidden="true">
            <span className="ring-total">{stats ? total : "–"}</span>
            <span className="ring-unit">{total === 1 ? "ride" : "rides"}</span>
          </div>
        </div>

        <div className="metrics-list">
          <div className="metrics-list-head">
            <span>Name</span>
            <span>Rides</span>
          </div>
          {!stats ? (
            <p className="muted">Loading…</p>
          ) : drivers.length === 0 ? (
            <p className="muted">No rides in this range.</p>
          ) : (
            <ul>
              {drivers.map((d) => (
                <li
                  key={d.id}
                  className={active === d.id ? "active" : active != null ? "dim" : undefined}
                  tabIndex={0}
                  onFocus={() => setActive(d.id)}
                  onBlur={() => setActive(null)}
                  {...point(d.id)}
                >
                  <span className="swatch" style={{ background: d.color }} aria-hidden="true" />
                  <span className="metrics-name">{d.name}</span>
                  <span className="metrics-count">{d.rides}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
  );
}

