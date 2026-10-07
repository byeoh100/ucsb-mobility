// Pick a time with two dropdowns: hour, then minute (5-minute steps).
// Used instead of <input type="time">, which has no picker in desktop Safari.
//
// Props:
//   value     "HH:MM" (24-hour) or "" when nothing is chosen yet
//   onChange  ("HH:MM") => void
//   earliest  "HH:MM": first hour offered (hours of operation)
//   latest    "HH:MM": last hour offered
//   label     what the time is for, for screen readers ("Pickup time")

const pad = (n) => String(n).padStart(2, "0");
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;

export default function TimeSelect({ value, onChange, earliest, latest, label }) {
  const [hour, minute] = value ? value.split(":") : ["", ""];

  const first = Number(earliest.split(":")[0]);
  const last = Number(latest.split(":")[0]);
  const hours = [];
  for (let h = first; h <= last; h++) hours.push(pad(h));
  const minutes = [];
  for (let m = 0; m < 60; m += 5) minutes.push(pad(m));
  // Keep an existing ride's time selectable even if it's off these lists
  // (booked before the hours changed, or at an odd minute).
  if (hour && !hours.includes(hour)) {
    hours.push(hour);
    hours.sort();
  }
  if (minute && !minutes.includes(minute)) {
    minutes.push(minute);
    minutes.sort();
  }

  return (
    <span className="time-select" role="group" aria-label={label}>
      <select
        aria-label={`${label}: hour`}
        aria-required="true"
        value={hour}
        // Choosing an hour first fills in :00, so one pick is enough for on-the-hour rides.
        onChange={(e) => onChange(e.target.value ? `${e.target.value}:${minute || "00"}` : "")}
      >
        <option value="">Hour</option>
        {hours.map((h) => (
          <option key={h} value={h}>{hourLabel(Number(h))}</option>
        ))}
      </select>
      <span aria-hidden="true">:</span>
      <select
        aria-label={`${label}: minutes`}
        value={minute}
        disabled={!hour}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
      >
        {!hour && <option value="">Min</option>}
        {minutes.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </span>
  );
}
