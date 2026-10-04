import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { riderApi } from "../api.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import CampusMap, { LocationDot } from "../components/CampusMap.jsx";
import PinEditor from "../components/PinEditor.jsx";
import MobileLayout from "../layouts/MobileLayout.jsx";
import { ageLabel } from "../lib/geo.js";
import { formatPhone } from "../lib/phone.js";
import { campusParts, formatDayLabel, formatTime, shiftDate, todayIn } from "../lib/time.js";

// How often to check for updates in each phase.
const REFRESH_MS = { upcoming: 60_000, live: 15_000 };

// The rider's page for one ride (/r/<token>). No sign-in: the link is the key.
// The server decides the phase (see rides/rider_page.py); this page shows it.
export default function RideLink() {
  const { token } = useParams();
  const { config } = useAuth();
  const timeZone = config.time_zone;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null); // "invalid" or a message

  const load = useCallback(async () => {
    try {
      setData(await riderApi.page(token));
      setError(null);
    } catch (err) {
      setError(err.status === 404 ? "invalid" : err.message);
    }
  }, [token]);

  const phase = data?.phase;
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const every = REFRESH_MS[phase];
    if (!every) return;
    const refresh = () => document.visibilityState === "visible" && load();
    const timer = setInterval(refresh, every);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [phase, load]);

  let body;
  if (error === "invalid") body = <Message title="This ride link isn't valid">It may have been mistyped, or the ride was removed.</Message>;
  else if (!data && error) body = <p className="error">{error}</p>;
  else if (!data) body = <p className="muted">Loading your ride…</p>;
  else if (phase === "expired") body = <Message title="This ride link has expired">Links stop working 15 minutes after the pickup time.</Message>;
  else if (phase === "complete") body = <Message title="Your ride is complete" tone="done">Thanks for riding! You can close this page.</Message>;
  else body = <ActiveRide data={data} token={token} timeZone={timeZone} onUpdate={setData} />;

  return (
    <MobileLayout title="Your ride">
      <div className="stack rider-page">
        {body}
        {error && data && <p className="error small">{error}</p>}
        <DispatchContact phone={data?.dispatch_phone} />
      </div>
    </MobileLayout>
  );
}

function ActiveRide({ data, token, timeZone, onUpdate }) {
  const { ride, live } = data;
  const [editingPins, setEditingPins] = useState(false);
  const today = todayIn(timeZone);
  const day = campusParts(ride.pickup_time, timeZone).date;
  const dayLabel = day === today ? "Today" : day === shiftDate(today, 1) ? "Tomorrow" : formatDayLabel(day);
  const hasPins = Boolean(ride.pickup_pin || ride.dropoff_pin);

  return (
    <>
      <section className="rider-summary">
        <span className="rider-day">{dayLabel}</span>
        <span className="rider-time">{formatTime(ride.pickup_time, timeZone)}</span>
        <dl className="rider-route">
          <div>
            <dt className="legend legend-pickup">Pick up</dt>
            <dd>{ride.pickup_name}</dd>
          </div>
          <div>
            <dt className="legend legend-dropoff">Drop off</dt>
            <dd>{ride.dropoff_name}</dd>
          </div>
        </dl>
      </section>

      {live ? (
        <LiveStatus live={live} ride={ride} token={token} onUpdate={onUpdate} />
      ) : (
        <p className="notice">Live updates start at {formatTime(ride.tracking_starts_at, timeZone)}, 15 minutes before pickup.</p>
      )}

      <section className="stack">
        <h2 className="section-title">{editingPins ? "Mark your spots" : "Campus map"}</h2>
        {editingPins ? (
          <PinEditor
            pickup={ride.pickup_pin}
            dropoff={ride.dropoff_pin}
            onSave={async (pins) => onUpdate(await riderApi.pins(token, pins))}
            onDone={() => setEditingPins(false)}
          />
        ) : (
          <>
            <CampusMap
              pickup={ride.pickup_pin}
              dropoff={ride.dropoff_pin}
              note={driverNote(live)}
              emptyNote={null}
            >
              {live?.driver_location?.on_map && (
                <LocationDot
                  point={live.driver_location}
                  label={live.driver?.name ?? "Driver"}
                  stale={!live.driver_location.live}
                />
              )}
            </CampusMap>
            <button className="button-quiet" onClick={() => setEditingPins(true)}>
              {hasPins ? "Change my pickup & drop-off spots" : "Mark my pickup & drop-off spots (optional)"}
            </button>
            {!hasPins && <p className="hint">Helps your driver find you, especially at big buildings.</p>}
          </>
        )}
      </section>
    </>
  );
}

function driverNote(live) {
  const loc = live?.driver_location;
  if (!loc) return null;
  if (!loc.on_map) return "Your driver is outside the map area.";
  if (!loc.live) return `Driver location from ${ageLabel(loc.age_seconds)}.`;
  return null;
}

// The main "what's happening" panel during the live window.
function LiveStatus({ live, ride, token, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onTheWay = live.status === "on_the_way";

  let headline, detail;
  if (!live.driver) {
    headline = "Waiting for a driver";
    detail = "Dispatch hasn't assigned a driver yet.";
  } else if (onTheWay) {
    headline = `${live.driver.name} is on the way`;
    detail = "Head to your pickup spot.";
  } else if (live.dropoffs_away > 0) {
    const n = live.dropoffs_away;
    headline = `${live.driver.name} is ${n} drop-off${n === 1 ? "" : "s"} away`;
    detail = n === 1 ? "You're next. You'll see here when they're on the way to you." : "You'll see here when they're on the way to you.";
  } else {
    headline = `${live.driver.name} will head your way soon`;
    detail = "You'll see when they're on the way.";
  }

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      onUpdate(await riderApi.confirm(token));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`live-status${onTheWay ? " on-the-way" : ""}`} aria-live="polite">
      {/* No driver color dot here: driver colors are a dispatch tool, and next to
          the pickup/drop-off dots a colored dot would read as one of those. */}
      <p className="live-headline">{headline}</p>
      <p className="live-detail">{detail}</p>
      {onTheWay &&
        (ride.rider_confirmed ? (
          <p className="confirmed-badge">👍 You told your driver you'll be there</p>
        ) : (
          <button className="button thumbs-up" onClick={confirm} disabled={busy}>
            {busy ? "Sending…" : "👍 I'll be there"}
          </button>
        ))}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}

function Message({ title, children, tone }) {
  return (
    <section className={`stack rider-message${tone ? ` rider-message-${tone}` : ""}`}>
      {tone === "done" && <span className="done-mark" aria-hidden="true">✓</span>}
      <h1>{title}</h1>
      <p className="muted">{children}</p>
    </section>
  );
}

function DispatchContact({ phone }) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "").slice(-10);
  return (
    <section className="dispatch-contact">
      <span>
        <strong>Questions about your ride?</strong>
        <span className="muted"> Dispatch can help.</span>
      </span>
      <a className="button-quiet call-dispatch" href={`tel:+1${digits}`}>
        Call {formatPhone(digits)}
      </a>
    </section>
  );
}
