import { formatDayLabel, shiftDate } from "../../lib/time.js";

// ‹ Friday, Oct 2 ›  [Today]  [date picker]
//
// Props: date ("YYYY-MM-DD"), today, onChange(date, { replace }) (replace: from
// typing in the date box, one change per keystroke)
export default function DateNav({ date, today, onChange }) {
  const offset = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
  const relative = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : offset === -1 ? "Yesterday" : null;

  return (
    <div className="date-nav">
      <div className="date-stepper">
        <button className="stepper-button" onClick={() => onChange(shiftDate(date, -1))} aria-label="Previous day">
          ‹
        </button>
        <div className="date-label">
          <span className="date-main">{formatDayLabel(date)}</span>
          {relative && <span className="date-relative">{relative}</span>}
        </div>
        <button className="stepper-button" onClick={() => onChange(shiftDate(date, 1))} aria-label="Next day">
          ›
        </button>
      </div>
      <button className="button-quiet" onClick={() => onChange(today)} disabled={date === today}>
        Today
      </button>
      <input
        type="date"
        className="date-input"
        value={date}
        onChange={(e) => e.target.value && onChange(e.target.value, { replace: true })}
        aria-label="Pick a date"
      />
    </div>
  );
}
