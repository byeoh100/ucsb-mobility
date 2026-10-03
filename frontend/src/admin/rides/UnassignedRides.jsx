import { useEffect, useRef, useState } from "react";
import RideTable from "./RideTable.jsx";

// "Unassigned rides (n) ▾" bar above the main list. Opens on its own when
// there are any; can be collapsed; does nothing when there are none.
export default function UnassignedRides({ rides, ...tableProps }) {
  const count = rides.length;
  const [open, setOpen] = useState(count > 0);
  const previous = useRef(count);

  // Pop open whenever unassigned rides appear (e.g. a driver was removed).
  useEffect(() => {
    if (previous.current === 0 && count > 0) setOpen(true);
    previous.current = count;
  }, [count]);

  const expanded = open && count > 0;

  return (
    <section className={`unassigned${count > 0 ? " has-rides" : ""}`}>
      <button
        className="unassigned-bar"
        onClick={() => setOpen(!open)}
        disabled={count === 0}
        aria-expanded={expanded}
      >
        <span>
          Unassigned rides <span className="unassigned-count">({count})</span>
        </span>
        <span className={`chevron${expanded ? " open" : ""}`} aria-hidden="true">▾</span>
      </button>
      {expanded && <RideTable rides={rides} {...tableProps} />}
    </section>
  );
}
