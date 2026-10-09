import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { ridesApi } from "../api.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import MobileLayout from "../layouts/MobileLayout.jsx";
import { toMapPoint } from "../lib/geo.js";
import { formatDayLabel, formatTime, isValidDate, shiftDate, todayIn } from "../lib/time.js";
import CurrentRides from "./CurrentRides.jsx";
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

  // Which way to slide when switching My/All rides or the day: toward "All" or
  // a later day comes in from the right; back comes in from the left.
  const slide = useSlideDirection(view, date);

  const [rides, setRides] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);

  // Only the newest request may update the list, so a slow answer for the
  // day you just left can't show up under this one.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latest.current;
    try {
      const list = await ridesApi.list(date);
      if (request !== latest.current) return;
      setRides(list);
      setError("");
    } catch (err) {
      if (request === latest.current) setError(err.message);
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
      onBoard={current.length > 0}
      expanded={expanded === ride.id}
      onToggle={() => setExpanded(expanded === ride.id ? null : ride.id)}
    />
  );

  const mine = (rides ?? []).filter((r) => r.driver === myId);
  // Current: every ride on the way (riders can share the cart), oldest first.
  const current = isToday
    ? mine.filter((r) => r.status === "on_the_way").sort((a, b) => (a.started_at < b.started_at ? -1 : 1))
    : [];
  const upcoming = mine.filter((r) => r.status === "not_confirmed");
  // "Start next ride" picks the soonest one; drivers can pick any other from its
// row ("Start ride", or "Add to current" with a rider already on board).
  const next = isToday ? upcoming[0] : null;
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  async function startNext() {
    setStarting(true);
    setStartError("");
    try {
      await ridesApi.start(next.id);
      await load();
    } catch (err) {
      setStartError(err.message);
    } finally {
      setStarting(false);
    }
  }

  // Share GPS only while a ride is on the way; also drives the "You" dot.
  // Whether one is comes from today's list, and is kept while the driver
  // looks at another day (or the list is reloading), so peeking at tomorrow
  // doesn't stop sharing mid-ride.
  const [onTheWay, setOnTheWay] = useState(false);
  useEffect(() => {
    if (rides && isToday) setOnTheWay(current.length > 0);
  }, [rides, isToday, current.length]);
  const { position, state: sharing } = useLocationSharing(onTheWay);
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
        <div className="segmented sliding" role="tablist" aria-label="Which rides">
          {/* The highlight slides between the two tabs */}
          <span className={`segmented-thumb${view === "all" ? " at-end" : ""}`} aria-hidden="true" />
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
            <span key={date} className={`slide-${slide}`}>
              {isToday ? "Today" : date === shiftDate(today, 1) ? "Tomorrow" : formatDayLabel(date)}
            </span>
          </span>
          <button className="stepper-button" onClick={() => update({ date: shiftDate(date, 1) })} aria-label="Next day">›</button>
        </div>

        {error && (
          <p className="error" role="alert">
            {error} <button className="button-quiet" onClick={load}>Try again</button>
          </p>
        )}
        {rides === null && !error && <p className="muted">Loading rides…</p>}

        {/* Keyed by view and day, so switching either slides the list in. */}
        {rides && (
          <div key={`${view}-${date}`} className={`stack slide-${slide}`}>
          {view === "mine" && (
            <>
              {isToday && mine.length > 0 && (
                <section className="stack">
                  <h2 className="section-title">{current.length > 1 ? `Current rides (${current.length})` : "Current ride"}</h2>
                  {current.length > 0 ? (
                    <CurrentRides rides={current} cardProps={cardProps} you={you} sharing={sharing} />
                  ) : (
                    <p className="current-empty muted">No current ride.</p>
                  )}
                </section>
              )}
              {next && (
                // With a rider on board, "Add next ride" is outlined and set off by a
                // divider, so it doesn't compete with that rider's Mark complete.
                <div className={`start-next${current.length > 0 ? " start-next-add" : ""}`}>
                  <button className="button otw-button" onClick={startNext} disabled={starting}>
                    {starting ? "Starting…" : current.length > 0 ? "Add next ride" : "Start next ride"}
                  </button>
                  <span className="hint">
                    {formatTime(next.pickup_time, timeZone)} · {next.rider_name} · {next.pickup_name}
                  </span>
                  {startError && <p className="error" role="alert">{startError}</p>}
                </div>
              )}
              {upcoming.length > 0 && (
                <section className="stack">
                  <h2 className="section-title">Your rides</h2>
                  {isToday && <p className="hint">Tap a ride for its map and notes, or to pick it up out of order.</p>}
                  <ul className="ride-list">{upcoming.map((r) => row(r, false))}</ul>
                </section>
              )}
              {mine.length === 0 && (
                <div className="empty-state">
                  <p>No rides assigned to you {isToday ? "today" : "this day"}.</p>
                  <p className="muted">Check All rides to see who's driving what.</p>
                </div>
              )}
              {mine.length > 0 && current.length === 0 && upcoming.length === 0 && (
                <p className="muted">You're done for {isToday ? "today" : "this day"}.</p>
              )}
              {done.length > 0 && (
                <>
                  <hr className="list-divider" />
                  <details className="done-rides">
                    <summary>Done ({done.length})</summary>
                    <ul className="ride-list">{done.map((r) => row(r, false))}</ul>
                  </details>
                </>
              )}
            </>
          )}

          {view === "all" && (
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
        )}
      </div>
    </MobileLayout>
  );
}

// "right" | "left" | "none": the direction of the last My/All or day switch.
// Remembered (not reset) so the list slides in that way once it has loaded.
function useSlideDirection(view, date) {
  const previous = useRef({ view, date });
  const direction = useRef("none");
  if (view !== previous.current.view) direction.current = view === "all" ? "right" : "left";
  else if (date !== previous.current.date) direction.current = date > previous.current.date ? "right" : "left";
  previous.current = { view, date };
  return direction.current;
}
