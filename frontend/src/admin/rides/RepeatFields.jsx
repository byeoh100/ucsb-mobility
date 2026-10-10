import { DAYS } from "../../lib/shifts.js";
import { shiftDate, shortDate, weekdayOf } from "../../lib/time.js";

// "Repeat" options for a new ride: which weekdays, and until when. The server
// makes one ride per matching day (rides/recurrence.py), each with its own link.
//
// Props:
//   start     "YYYY-MM-DD", the first ride's date
//   days      [0..4], Monday = 0 (the server's numbering); weekdays only
//   until     "YYYY-MM-DD" or ""
//   onChange  ({ days, until }) => void
//   error     message to show, if any

export const MAX_SPAN_DAYS = 120; // keep in step with rides/recurrence.py
// Rides repeat on weekdays only (no service on weekends): DAYS is Mon-Fri.
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

// Every date from start to until (inclusive) on one of the chosen weekdays.
export function repeatDates(start, days, until) {
  const dates = [];
  if (!start || !until || until < start) return dates;
  for (let d = start; d <= until && dates.length <= 366; d = shiftDate(d, 1)) {
    if (days.includes(weekdayOf(d))) dates.push(d);
  }
  return dates;
}

// What's wrong with these choices, or "" if nothing.
export function repeatProblem(start, days, until) {
  if (days.length === 0) return "Pick at least one day.";
  if (!until) return "Choose the last day.";
  if (until < start) return "The last day can't be before the first ride.";
  if (until > shiftDate(start, MAX_SPAN_DAYS)) return `Repeat for at most ${MAX_SPAN_DAYS} days.`;
  if (repeatDates(start, days, until).length === 0) return "None of the chosen days fall in that range.";
  return "";
}

export default function RepeatFields({ start, days, until, onChange, error }) {
  const dates = repeatDates(start, days, until);
  const toggle = (day) =>
    onChange({ days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort(), until });

  return (
    <div className="repeat-fields stack">
      <div className="field">
        <span id="repeat-days-label">On</span>
        <div className="weekday-picker" role="group" aria-labelledby="repeat-days-label">
          {DAYS.map((label, day) => (
            <button
              key={day}
              type="button"
              className="weekday"
              aria-pressed={days.includes(day)}
              aria-label={WEEKDAY_NAMES[day]}
              onClick={() => toggle(day)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <label className="field repeat-until">
        <span>Until</span>
        <input
          type="date"
          value={until}
          min={start}
          max={shiftDate(start, MAX_SPAN_DAYS)}
          onChange={(e) => onChange({ days, until: e.target.value })}
        />
      </label>
      {error ? (
        <span className="field-error">{error}</span>
      ) : (
        dates.length > 0 && (
          <p className="hint" aria-live="polite">
            Adds {dates.length} {dates.length === 1 ? "ride" : "rides"}, {shortDate(dates[0])} to{" "}
            {shortDate(dates[dates.length - 1])}. Holidays aren't skipped: delete those rides on their day.
          </p>
        )
      )}
    </div>
  );
}
