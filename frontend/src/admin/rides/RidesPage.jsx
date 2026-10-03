import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ridesApi } from "../../api.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { isValidDate, todayIn } from "../../lib/time.js";
import DateNav from "./DateNav.jsx";
import RideTable from "./RideTable.jsx";
import UnassignedRides from "./UnassignedRides.jsx";

const REFRESH_MS = 60_000; // statuses change with the clock, so refresh while open

// Admin → Rides: one day at a time. The day lives in the URL (?date=…) so
// reloading or sharing the link keeps you on the same day.
export default function RidesPage() {
  const { config } = useAuth();
  const timeZone = config.time_zone;
  const today = todayIn(timeZone);

  const [params, setParams] = useSearchParams();
  const date = isValidDate(params.get("date")) ? params.get("date") : today;
  const setDate = (next) => setParams(next === today ? {} : { date: next });

  const [rides, setRides] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ key: "time", dir: "asc" });

  const load = useCallback(async () => {
    try {
      setRides(await ridesApi.list(date));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [date]);

  // Load when the day changes, then refresh every minute while the tab is visible.
  useEffect(() => {
    setRides(null);
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const unassigned = rides?.filter((r) => !r.driver) ?? [];
  const assigned = rides?.filter((r) => r.driver) ?? [];
  const tableProps = { timeZone, sort, onSort: setSort };

  return (
    <section className="stack">
      <div className="page-header">
        <h1>
          Rides {rides && <span className="count">{rides.length}</span>}
        </h1>
        <DateNav date={date} today={today} onChange={setDate} />
      </div>

      {error && (
        <p className="error" role="alert">
          {error} <button className="button-quiet" onClick={load}>Try again</button>
        </p>
      )}
      {rides === null && !error && <p className="muted">Loading rides…</p>}

      {rides && (
        <>
          <UnassignedRides rides={unassigned} {...tableProps} />
          {assigned.length > 0 ? (
            <RideTable rides={assigned} {...tableProps} />
          ) : (
            <div className="empty-state">
              <p>{rides.length === 0 ? "No rides on this day." : "No assigned rides on this day."}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
