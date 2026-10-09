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

// Where a new shift would go if added at `minute` on `weekday`: 1 hour in that
// hour block, moved over or shortened to fit between the driver's other
// shifts. null if there's no room (or the spot is inside one of their shifts).
export function placeNewShift(shifts, weekday, minute, open, close) {
  const at = Math.floor(minute / STEP) * STEP;
  const inside = shifts.some((s) => s.weekday === weekday && toMinutes(s.start) <= at && at < toMinutes(s.end));
  if (inside) return null;
  const probe = [...shifts, { weekday, start: fromMinutes(at), end: fromMinutes(at) }];
  const [lo, hi] = roomFor(probe, probe.length - 1, open, close);
  let start = Math.min(Math.max(Math.floor(at / 60) * 60, open), close - 60);
  start = Math.max(start, lo);
  if (start + 60 > hi) start = Math.max(lo, hi - 60);
  const end = Math.min(start + 60, hi);
  if (end - start < STEP) return null;
  return { weekday, start: fromMinutes(start), end: fromMinutes(end) };
}

// The stretches of a day nobody is on shift: [[start, end], ...] in minutes.
export function gapsIn(shifts, open, close) {
  const spans = shifts.map((s) => [toMinutes(s.start), toMinutes(s.end)]).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let covered = open;
  for (const [s, e] of spans) {
    if (s > covered) gaps.push([covered, Math.min(s, close)]);
    covered = Math.max(covered, e);
  }
  if (covered < close) gaps.push([covered, close]);
  return gaps.filter(([s, e]) => e > s);
}

// Text color that reads best on a driver's color (dark on the light colors).
export function textOn(hex) {
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const bg = lum(hex);
  return contrast(bg, 1) >= contrast(bg, lum("#1d2329")) ? "#ffffff" : "#1d2329";
}
