import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { driversApi, ridesApi } from "../../api.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Modal from "../../components/Modal.jsx";
import { archiveCutoffIn, isValidDate, todayIn } from "../../lib/time.js";

import { campusParts, formatTime } from "../../lib/time.js";
import DateNav from "./DateNav.jsx";
import RideForm from "./RideForm.jsx";
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
  // Days before this have moved to the Archive (at 8 AM the next morning).
  const archived = date < archiveCutoffIn(timeZone, config.archive_hour);

  const [rides, setRides] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ key: "time", dir: "asc" });
  const [drivers, setDrivers] = useState([]);
  // null = form closed, { ride: null } = adding, { ride } = editing
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null); // ride pending deletion

  // Drivers for the form's dropdown.
  useEffect(() => {
    driversApi.list().then(setDrivers).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (archived) {
      setRides([]);
      return;
    }
    try {
      setRides(await ridesApi.list(date));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, [date, archived]);

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
  const tableProps = {
    timeZone,
    sort,
    onSort: setSort,
    onEdit: (ride) => setEditing({ ride }),
  };

  function handleSaved(saved) {
    setEditing(null);
    // If the ride landed on another day, go there so it's visible.
    const savedDate = campusParts(saved.pickup_time, timeZone).date;
    if (savedDate !== date) setDate(savedDate);
    else load();
  }

  return (
    <section className="stack">
      <div className="page-header">
        <h1>
          Rides {rides && !archived && <span className="count">{rides.length}</span>}
        </h1>
        <div className="page-actions">
          <DateNav date={date} today={today} onChange={setDate} />
          <button className="button" onClick={() => setEditing({ ride: null })}>
            + Add ride
          </button>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error} <button className="button-quiet" onClick={load}>Try again</button>
        </p>
      )}
      {rides === null && !error && <p className="muted">Loading rides…</p>}

      {archived && (
        <div className="empty-state">
          <p>This day's rides have moved to the Archive.</p>
          <Link to={`/admin/archive?date=${date}`}>View them in the Archive →</Link>
        </div>
      )}

      {rides && !archived && (
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

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.ride ? `Edit ride for ${editing.ride.rider_name}` : "Add ride"}
        wide
      >
        {editing && (
          <RideForm
            key={editing.ride?.id ?? "new"}
            ride={editing.ride}
            defaultDate={date < today ? today : date}
            today={today}
            drivers={drivers}
            timeZone={timeZone}
            onCancel={() => setEditing(null)}
            onSaved={handleSaved}
            onDelete={(ride) => {
              // Swap the edit dialog for the confirmation.
              setEditing(null);
              setDeleting(ride);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete ride for ${deleting.rider_name}?` : ""}
        confirmLabel="Delete ride"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await ridesApi.remove(deleting.id);
          } catch (err) {
            // Already gone (e.g. deleted in another tab): that's what we wanted.
            if (err.status !== 404) throw err;
          }
          await load();
        }}
      >
        {deleting && (
          <>
            <p>
              <strong>{formatTime(deleting.pickup_time, timeZone)}</strong> · {deleting.pickup_name} →{" "}
              {deleting.dropoff_name}
              {deleting.driver_name && <> · {deleting.driver_name}</>}
            </p>
            <p className="muted">The rider's link will stop working. This can't be undone.</p>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
