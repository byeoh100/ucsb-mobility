import mapUrl from "../assets/campus-map.jpg";

// The campus map image with the rider's optional pickup/drop-off pins.
// Pins are stored as fractions of the image ({ x: 0.42, y: 0.61 }), so they
// land in the same place at any size. Shared by the driver view and the
// rider page; `children` can add overlays (e.g. the driver's location, later).
//
// Props: pickup, dropoff ({ x, y } or null), children
export default function CampusMap({ pickup, dropoff, children }) {
  const hasPins = Boolean(pickup || dropoff);
  return (
    <figure className="campus-map">
      <div className="campus-map-frame">
        <img src={mapUrl} alt="Map of the UCSB campus" draggable={false} />
        {pickup && <Pin point={pickup} kind="pickup" label="Pickup" />}
        {dropoff && <Pin point={dropoff} kind="dropoff" label="Drop-off" />}
        {children}
      </div>
      <figcaption className="campus-map-caption">
        {hasPins ? (
          <>
            {pickup && <span className="legend legend-pickup">Pickup</span>}
            {dropoff && <span className="legend legend-dropoff">Drop-off</span>}
          </>
        ) : (
          <span className="muted">The rider hasn't marked spots on the map.</span>
        )}
      </figcaption>
    </figure>
  );
}

// A map pin whose tip (bottom center) sits exactly on the point.
export function Pin({ point, kind, label }) {
  return (
    <svg
      className={`map-pin map-pin-${kind}`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      viewBox="0 0 24 32"
      role="img"
      aria-label={`${label} pin`}
    >
      <title>{label}</title>
      <path d="M12 1C5.9 1 1 5.9 1 12c0 8.3 11 19 11 19s11-10.7 11-19C23 5.9 18.1 1 12 1z" />
      <text x="12" y="16" textAnchor="middle">{kind === "pickup" ? "P" : "D"}</text>
    </svg>
  );
}
