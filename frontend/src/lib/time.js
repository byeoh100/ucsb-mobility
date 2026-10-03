// Dates are "YYYY-MM-DD" strings for a calendar day on campus.
// Times are shown in the campus time zone (from the server), not the device's.

// Today's date on campus, e.g. "2026-10-02".
export function todayIn(timeZone) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

// Move a "YYYY-MM-DD" date by n days. Done in UTC so DST never skips a day.
export function shiftDate(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
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
