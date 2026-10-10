// Dates are "YYYY-MM-DD" strings for a calendar day on campus.
// Times are shown in the campus time zone (from the server), not the device's.

// Today's date on campus, e.g. "2026-10-02".
export function todayIn(timeZone, at = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(at);
}

// Days before this date are archived. Mirrors rides/archive.py: the date
// rolls over at the archive hour (8 AM) instead of midnight.
export function archiveCutoffIn(timeZone, archiveHour) {
  return todayIn(timeZone, new Date(Date.now() - archiveHour * 3600 * 1000));
}

// Move a "YYYY-MM-DD" date by n days. Done in UTC so DST never skips a day.
export function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A real "YYYY-MM-DD" calendar date ("2026-02-31" isn't: Date would roll it
// over to March 3).
export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Monday = 0 ... Sunday = 6 (the server's numbering) for a "YYYY-MM-DD" date.
export function weekdayOf(isoDate) {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// "Oct 19" (or another format via `opts`, e.g. { weekday: "short" } → "Mon")
export function shortDate(isoDate, opts = { month: "short", day: "numeric" }) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });
}

// "Friday, Oct 2"
export function formatDayLabel(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// "9:30 AM"
export function formatTime(isoDateTime, timeZone) {
  return new Date(isoDateTime).toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
}

// Split a stored ride time into campus-local parts for form inputs:
// { date: "2026-10-03", time: "09:30" }
export function campusParts(isoDateTime, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(isoDateTime))
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
