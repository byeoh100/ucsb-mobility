import { formatDayLabel, shiftDate } from "../../lib/time.js";

// ‹ Friday, Oct 2 ›  [Today]  [date picker]
//
// Props: date ("YYYY-MM-DD"), today, onChange(date)
export default function DateNav({ date, today, onChange }) {
  const offset = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
  const relative = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : offset === -1 ? "Yesterday" : null;

  return (
    <div className="date-nav">
      <button className="button-quiet icon-button" onClick={() => onChange(shiftDate(date, -1))} aria-label="Previous day">
        ‹
      </button>
      <div className="date-label">
        <span className="date-main">{formatDayLabel(date)}</span>
        {relative && <span className="date-relative">{relative}</span>}
      </div>
      <button className="button-quiet icon-button" onClick={() => onChange(shiftDate(date, 1))} aria-label="Next day">
        ›
      </button>
      <button className="button-quiet" onClick={() => onChange(today)} disabled={date === today}>
        Today
      </button>
      <input
        type="date"
        className="date-input"
        value={date}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Pick a date"
      />
    </div>
  );
}
