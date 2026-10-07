import { useState } from "react";
import { Link } from "react-router";
import { riderApi } from "../api.js";
import { homeForRole, useAuth } from "../auth/AuthProvider.jsx";
import PhoneInput from "../components/PhoneInput.jsx";
import MobileLayout from "../layouts/MobileLayout.jsx";
import { isCompletePhone } from "../lib/phone.js";
import { campusParts, formatDayLabel, formatTime, shiftDate, todayIn } from "../lib/time.js";

// Default page: riders find their ride by phone number, no sign-in needed.
export default function Home() {
  const { user, config, signOut } = useAuth();
  const timeZone = config.time_zone;
  const [phone, setPhone] = useState("");
  const [rides, setRides] = useState(null); // null = not searched yet
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookUp(e) {
    e.preventDefault();
    if (!isCompletePhone(phone)) {
      setError("Enter all 10 digits of your phone number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setRides(await riderApi.lookup(phone));
    } catch (err) {
      setRides(null);
      setError(err.status === 429 ? "Too many lookups. Wait a minute and try again." : err.message);
    } finally {
      setBusy(false);
    }
  }

  let headerAction = null;
  if (user === null) headerAction = <Link to="/sign-in" className="button-quiet">Staff sign in</Link>;
  else if (user?.role === "rider") headerAction = <button className="button-quiet" onClick={signOut}>Sign out</button>;
  else if (user)
    headerAction = (
      <Link to={homeForRole(user.role)} className="button-quiet">
        {user.role === "admin" ? "Dispatch" : "Driver view"}
      </Link>
    );

  const today = todayIn(timeZone);
  const dayLabel = (iso) => {
    const day = campusParts(iso, timeZone).date;
    return day === today ? "Today" : day === shiftDate(today, 1) ? "Tomorrow" : formatDayLabel(day);
  };

  return (
    <MobileLayout title="UCSB Mobility Tracker" actions={headerAction}>
      <form className="stack" onSubmit={lookUp} noValidate>
        <div>
          <h1>Find your ride</h1>
          <p className="muted lead">Enter the phone number dispatch has on file for you.</p>
        </div>
        <label className="field">
          Phone number
          <PhoneInput
            value={phone}
            onChange={(digits) => {
              setPhone(digits);
              setError("");
              setRides(null);
            }}
            autoComplete="tel-national"
          />
        </label>
        <button type="submit" className="button" disabled={busy || !phone}>
          {busy ? "Looking…" : "Look up my ride"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>

      {!rides && (
        <section className="how-it-works">
          <h2 className="section-title">On your ride page</h2>
          <ul>
            <li>See when your driver is on the way, starting 20 minutes before pickup</li>
            <li>Follow your driver on the campus map</li>
            <li>Mark exactly where you'll be waiting (optional)</li>
          </ul>
        </section>
      )}

      {rides && (
        <section className="stack lookup-results" aria-live="polite">
          {rides.length === 0 ? (
            <p className="muted">No upcoming rides for that number. If you think that's wrong, contact dispatch.</p>
          ) : (
            <ul className="ride-list">
              {rides.map((r) => (
                <li key={r.link_token}>
                  <Link className="lookup-ride" to={`/r/${r.link_token}`}>
                    <span className="lookup-when">
                      {dayLabel(r.pickup_time)} · <strong>{formatTime(r.pickup_time, timeZone)}</strong>
                    </span>
                    <span className="lookup-route">
                      {r.pickup_name} → {r.dropoff_name}
                    </span>
                    <span className="lookup-open">Open ›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </MobileLayout>
  );
}
