import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ridesApi } from "../api.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import MobileLayout from "../layouts/MobileLayout.jsx";
import { toMapPoint } from "../lib/geo.js";
import { formatDayLabel, isValidDate, shiftDate, todayIn } from "../lib/time.js";
import RideCard from "./RideCard.jsx";
import RideRow from "./RideRow.jsx";
import useLocationSharing from "./useLocationSharing.js";

const REFRESH_MS = 30_000;

// The driver profile. "My rides" puts what to do now at the top:
// the ride you're on, then the next one. "All rides" shows everyone's rides
// so drivers can arrange swaps, as they do today.
export default function DriverHome() {
  const { user, config, signOut } = useAuth();
  const timeZone = config.time_zone;
  const today = todayIn(timeZone);
  const myId = user.driver?.id;

  const [params, setParams] = useSearchParams();
  const date = isValidDate(params.get("date")) && params.get("date") > today ? params.get("date") : today;
  const view = params.get("view") === "all" || !myId ? "all" : "mine";
  const update = (changes) => {
    const next = { date, view, ...changes };
    setParams({ ...(next.date !== today && { date: next.date }), ...(next.view === "all" && { view: "all" }) });
  };

  const [rides, setRides] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      setRides(await ridesApi.list(date));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [date]);

  useEffect(() => {
    setRides(null);
    load();
    const refresh = () => document.visibilityState === "visible" && load();
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const isToday = date === today;
  const cardProps = (ride) => {
    const mine = ride.driver === myId && myId != null;
    return {
      ride,
      mine,
      canStart: mine && isToday && ride.status !== "completed",
      canReopen: mine && isToday && Boolean(ride.completed_at),
      timeZone,
      onChanged: load,
    };
  };
  const row = (ride, showDriver) => (
    <RideRow
      key={ride.id}
      {...cardProps(ride)}
      showDriver={showDriver}
      expanded={expanded === ride.id}
      onToggle={() => setExpanded(expanded === ride.id ? null : ride.id)}
    />
  );

  const mine = (rides ?? []).filter((r) => r.driver === myId);
  const current = isToday ? mine.find((r) => r.status === "on_the_way") : null;
  const next = isToday ? mine.find((r) => r.status === "not_confirmed" && r !== current) : null;
  const later = mine.filter((r) => r !== current && r !== next && r.status !== "completed");

  // Share GPS only while a ride is on the way; also drives the "You" dot.
  const { position, state: sharing } = useLocationSharing(Boolean(current));
  const you = position ? toMapPoint(position, config.map_calibration) : null;
  const done = mine.filter((r) => r.status === "completed");

  return (
    <MobileLayout
      title={
        user.driver ? (
          <>
            {/* The color dispatch uses for this driver's rides */}
            <span className="swatch header-swatch" style={{ background: user.driver.color }} aria-hidden="true" />
            {user.driver.name}
          </>
        ) : (
          "UCSB Mobility Tracker"
        )
      }
      actions={<button className="button-quiet" onClick={signOut}>Sign out</button>}
    >
      <div className="stack driver-home">
        <div className="segmented" role="tablist" aria-label="Which rides">
          <button role="tab" aria-selected={view === "mine"} disabled={!myId} onClick={() => update({ view: "mine" })}>
            My rides
          </button>
          <button role="tab" aria-selected={view === "all"} onClick={() => update({ view: "all" })}>
            All rides
          </button>
        </div>

        <div className="day-switch date-stepper">
          <button className="stepper-button" onClick={() => update({ date: shiftDate(date, -1) })} disabled={isToday} aria-label="Previous day">‹</button>
          <span className="day-switch-label">
            {isToday ? "Today" : date === shiftDate(today, 1) ? "Tomorrow" : formatDayLabel(date)}
          </span>
          <button className="stepper-button" onClick={() => update({ date: shiftDate(date, 1) })} aria-label="Next day">›</button>
        </div>

        {error && (
          <p className="error" role="alert">
            {error} <button className="button-quiet" onClick={load}>Try again</button>
          </p>
        )}
        {rides === null && !error && <p className="muted">Loading rides…</p>}

        {rides && view === "mine" && (
          <>
            {current && (
              <section className="stack">
                <h2 className="section-title">On the way</h2>
                {/* key: a different ride gets a fresh card (map, errors), not the old one's state */}
                <RideCard key={current.id} {...cardProps(current)} highlight="current" mapOpen you={you} sharing={sharing} />
              </section>
            )}
            {next && (
              <section className="stack">
                <h2 className="section-title">Up next</h2>
                <RideCard key={next.id} {...cardProps(next)} highlight="next" mapOpen={!current} />
              </section>
            )}
            {later.length > 0 && (
              <section className="stack">
                <h2 className="section-title">{isToday ? "Later" : "Your rides"}</h2>
                <ul className="ride-list">{later.map((r) => row(r, false))}</ul>
              </section>
            )}
            {mine.length === 0 && (
              <div className="empty-state">
                <p>No rides assigned to you {isToday ? "today" : "this day"}.</p>
                <p className="muted">Check All rides to see who's driving what.</p>
              </div>
            )}
            {mine.length > 0 && !current && !next && later.length === 0 && (
              <p className="muted">You're done for {isToday ? "today" : "this day"}.</p>
            )}
            {done.length > 0 && (
              <details className="done-rides">
                <summary>Done ({done.length})</summary>
                <ul className="ride-list">{done.map((r) => row(r, false))}</ul>
              </details>
            )}
          </>
        )}

        {rides && view === "all" && (
          <>
            {rides.length === 0 ? (
              <div className="empty-state">
                <p>No rides {isToday ? "today" : "this day"}.</p>
              </div>
            ) : (
              <ul className="ride-list">{rides.map((r) => row(r, true))}</ul>
            )}
          </>
        )}
      </div>
    </MobileLayout>
  );
}
