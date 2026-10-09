import { shiftDate } from "../../lib/time.js";

// The Metrics date range: presets for the last 7 and 90 days (today
// included), or any start and end date.
//
// Props: from, to ("YYYY-MM-DD"), today, onChange({ from, to })
const PRESETS = [7, 90];

export default function RangePicker({ from, to, today, onChange }) {
  const preset = PRESETS.find((days) => to === today && from === shiftDate(today, 1 - days));
  return (
    <div className="range-picker">
      <div className="range-presets" role="group" aria-label="Quick ranges">
        {PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            className={preset === days ? "active" : undefined}
            aria-pressed={preset === days}
            onClick={() => onChange({ from: shiftDate(today, 1 - days), to: today })}
          >
            Last {days} days
          </button>
        ))}
      </div>
      <label className="range-field">
        <span>From</span>
        <input type="date" className="date-input" value={from} max={today} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} />
      </label>
      <label className="range-field">
        <span>To</span>
        <input type="date" className="date-input" value={to} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} />
      </label>
    </div>
  );
}
