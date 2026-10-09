import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { statsApi } from "../../api.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { isValidDate, shiftDate, todayIn } from "../../lib/time.js";
import BarChart from "./BarChart.jsx";
import RangePicker from "./RangePicker.jsx";
import RidesRing from "./RidesRing.jsx";
import Summary from "./Summary.jsx";

// Admin → Metrics: rides over a date range (in the URL as ?from=&to=, last 7
// days by default). What counts as a ride: backend/rides/metrics.py.
//
// Four blocks in a 2 × 2 grid, each sized to what's in it:
//   Rides by driver   ring + names     |  At a glance   summary numbers
//   Pickups by hour   bars             |  Rides per day (or week) bars
export default function MetricsPage() {
  const { config } = useAuth();
  const today = todayIn(config.time_zone);
  const [params, setParams] = useSearchParams();
  const from = isValidDate(params.get("from")) ? params.get("from") : shiftDate(today, -6);
  const to = isValidDate(params.get("to")) ? params.get("to") : today;
  const valid = from <= to;

  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!valid) return;
    setStats(null);
    try {
      setStats(await statsApi.get(from, to));
      setError("");
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  }, [from, to, valid]);

  useEffect(() => {
    load();
  }, [load]);

  const retention = config.archive_retention_days ?? 90;

  return (
    <section className="stack">
      <div className="page-header">
        <h1>Metrics</h1>
      </div>

      <RangePicker
        from={from}
        to={to}
        today={today}
        onChange={(range) => setParams(range, { replace: true })}
      />
      {!valid && <p className="error" role="alert">The start date has to be on or before the end date.</p>}
      {valid && from < shiftDate(today, -retention) && (
        <p className="hint">Rides are only kept for {retention} days, so days before that show nothing.</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error} <button className="button-quiet" onClick={load}>Try again</button>
        </p>
      )}

      {valid && (
        <div className="metrics-grid">
          <Block title="Rides by driver">
            <RidesRing stats={stats} />
          </Block>
          <Block title="At a glance">
            <Summary stats={stats} />
          </Block>
          <Block title="Pickups by hour">
            <BarChart bars={stats && hourBars(stats.by_hour)} unit="pickup" />
          </Block>
          <PerDay stats={stats} />
        </div>
      )}
    </section>
  );
}

function Block({ title, children }) {
  return (
    <section className="metrics-block">
      <h2 className="metrics-block-title">{title}</h2>
      {children}
    </section>
  );
}

// Daily bars up to a month; weekly (Monday to Sunday) beyond that.
function PerDay({ stats }) {
  const weekly = stats && stats.by_day.length > 31;
  return (
    <Block title={weekly ? "Rides per week" : "Rides per day"}>
      <BarChart bars={stats && (weekly ? weekBars(stats.by_day) : dayBars(stats.by_day))} unit="ride" />
    </Block>
  );
}

const shortDate = (iso, opts = { month: "short", day: "numeric" }) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...opts });

// 7 → "7a", 12 → "12p", 13 → "1p"
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;

function hourBars(byHour) {
  return byHour.map(({ hour, rides }) => ({
    key: hour,
    label: hourLabel(hour),
    value: rides,
    detail: `${hourLabel(hour)}–${hourLabel(hour + 1)}`,
  }));
}

function dayBars(byDay) {
  // Label every day for a week or two; every few days beyond that.
  const every = byDay.length <= 14 ? 1 : 7;
  return byDay.map(({ date, rides }, i) => ({
    key: date,
    label: i % every === 0 ? (byDay.length <= 7 ? shortDate(date, { weekday: "short" }) : shortDate(date)) : "",
    value: rides,
    detail: shortDate(date, { weekday: "short", month: "short", day: "numeric" }),
    weekend: [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay()),
  }));
}

function weekBars(byDay) {
  const weeks = [];
  for (const { date, rides } of byDay) {
    const d = new Date(`${date}T12:00:00Z`);
    if (!weeks.length || d.getUTCDay() === 1) weeks.push({ start: date, end: date, rides: 0 });
    const week = weeks[weeks.length - 1];
    week.rides += rides;
    week.end = date;
  }
  const every = weeks.length <= 14 ? 2 : 4;
  return weeks.map((w, i) => ({
    key: w.start,
    label: i % every === 0 ? shortDate(w.start) : "",
    value: w.rides,
    detail: `Week of ${shortDate(w.start)}${w.start === w.end ? "" : ` – ${shortDate(w.end)}`}`,
  }));
}
