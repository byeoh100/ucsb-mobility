import { useState } from "react";

// Simple vertical bars that stretch to the block's width. Pointing at (or
// tabbing to) a bar shows its count above it and greys out the rest.
//
// Props:
//   bars  [{ key, label, value, detail, weekend? }] or null while loading
//   unit  "ride" or "pickup", for screen readers
export default function BarChart({ bars, unit }) {
  const [active, setActive] = useState(null);
  if (!bars) return <div className="bar-chart loading" aria-busy="true" />;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const plural = (n) => `${n} ${unit}${n === 1 ? "" : "s"}`;

  return (
    <div className="bar-chart">
      <div className="bar-plot">
        <span className="bar-max" aria-hidden="true">{max}</span>
        <div className="bars">
          {bars.map((b) => (
            <div
              key={b.key}
              className={`bar-slot${active === b.key ? " active" : ""}${b.weekend ? " weekend" : ""}`}
              tabIndex={0}
              aria-label={`${b.detail}: ${plural(b.value)}`}
              title={b.detail}
              onPointerEnter={() => setActive(b.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(b.key)}
              onBlur={() => setActive(null)}
            >
              <span className="bar" style={{ height: `${(b.value / max) * 100}%` }}>
                {active === b.key && <span className="bar-value">{b.value}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bar-labels" aria-hidden="true">
        {bars.map((b) => (
          <span key={b.key}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}
