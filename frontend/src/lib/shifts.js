// Driver shifts: weekly blocks like { weekday: 0, start: "09:00", end: "13:00" }.
// Weekday 0 = Monday, matching the server (accounts.models.DriverShift).

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const STEP = 15; // minutes; shifts start and end on the quarter hour

// "09:30" ⇄ 570 (minutes since midnight)
export const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const fromMinutes = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// 570 → "9:30", 780 → "1:00" (no AM/PM: the timeline's position says which)
export const shortTime = (minutes) => `${Math.floor(minutes / 60) % 12 || 12}:${String(minutes % 60).padStart(2, "0")}`;
// 570 → "9:30 AM"
export const longTime = (minutes) => `${shortTime(minutes)} ${minutes < 720 ? "AM" : "PM"}`;

export const snap = (minutes) => Math.round(minutes / STEP) * STEP;

// Monday = 0 for a "YYYY-MM-DD" date (Saturday/Sunday give 5/6).
export function weekdayOf(isoDate) {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// Is this driver on shift at this campus date and time ("HH:MM")?
// null when they have no shifts entered at all (nothing to compare against).
export function onShift(driver, isoDate, hhmm) {
  if (!driver?.shifts?.length || !isoDate || !hhmm) return null;
  const day = weekdayOf(isoDate);
  const t = toMinutes(hhmm);
  return driver.shifts.some((s) => s.weekday === day && toMinutes(s.start) <= t && t < toMinutes(s.end));
}

// The room a shift has on its day: from the end of the shift before it to the
// start of the one after it (or the hours of operation).
export function roomFor(shifts, index, open, close) {
  const me = shifts[index];
  let lo = open;
  let hi = close;
  shifts.forEach((s, i) => {
    if (i === index || s.weekday !== me.weekday) return;
    if (toMinutes(s.end) <= toMinutes(me.start)) lo = Math.max(lo, toMinutes(s.end));
    if (toMinutes(s.start) >= toMinutes(me.end)) hi = Math.min(hi, toMinutes(s.start));
  });
  return [lo, hi];
}
