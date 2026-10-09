import { useEffect, useRef, useState } from "react";
import RideCard from "./RideCard.jsx";

// The driver's current ride(s): every ride that's on the way. Riders can share
// the cart, so with more than one there's a tab per passenger; swipe or tap a
// tab to switch. Each passenger's card has its own Mark complete.
//
// Props:
//   rides      on-the-way rides, in the order they were started
//   cardProps  (ride) => RideCard props
//   you        the driver's own map position, if known
//   sharing    location-sharing state
export default function CurrentRides({ rides, cardProps, you, sharing }) {
  const [activeId, setActiveId] = useState(null);
  const swipeStart = useRef(null);

  // A passenger just added (e.g. "Add next ride") comes into view, even if
  // the driver had picked a tab before.
  const seen = useRef(null);
  const ids = rides.map((r) => r.id).join(",");
  useEffect(() => {
    const before = seen.current;
    seen.current = new Set(rides.map((r) => r.id));
    if (!before) return;
    const added = rides.filter((r) => !before.has(r.id));
    if (added.length) setActiveId(added[added.length - 1].id);
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stay on the chosen passenger while they're on board; otherwise show the
  // one started most recently (e.g. right after "Start next ride").
  const active = rides.find((r) => r.id === activeId) ?? rides[rides.length - 1];
  const activeIndex = rides.indexOf(active);
  const show = (i) => setActiveId(rides[(i + rides.length) % rides.length].id);

  const card = (ride) => (
    // key: a different ride gets a fresh card (map, errors), not the old one's state
    <RideCard key={ride.id} {...cardProps(ride)} you={you} sharing={sharing} />
  );

  if (rides.length === 1) return card(rides[0]);

  return (
    <div className="current-rides">
      <div className="passenger-tabs" role="tablist" aria-label="Passengers on board">
        {rides.map((r, i) => (
          <button
            key={r.id}
            role="tab"
            id={`passenger-tab-${r.id}`}
            aria-selected={r === active}
            aria-controls="passenger-panel"
            className="passenger-tab"
            onClick={() => show(i)}
          >
            {r.rider_name.split(" ")[0]}
          </button>
        ))}
      </div>
      <div
        id="passenger-panel"
        role="tabpanel"
        aria-labelledby={`passenger-tab-${active.id}`}
        // Swipe left/right to switch passengers.
        onTouchStart={(e) => (swipeStart.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (swipeStart.current == null) return;
          const dx = e.changedTouches[0].clientX - swipeStart.current;
          swipeStart.current = null;
          if (Math.abs(dx) > 60) show(activeIndex + (dx < 0 ? 1 : -1));
        }}
      >
        {card(active)}
      </div>
    </div>
  );
}
