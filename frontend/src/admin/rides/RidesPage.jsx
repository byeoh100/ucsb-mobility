import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { driversApi, ridesApi } from "../../api.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Modal from "../../components/Modal.jsx";
import { archiveCutoffIn, campusParts, formatTime, isValidDate, todayIn } from "../../lib/time.js";
import DateNav from "./DateNav.jsx";
import FormExport from "./FormExport.jsx";
import FormImport from "./FormImport.jsx";
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
  // Typing in the date box changes the date per keystroke; replace those
  // history entries instead of piling them up.
  const setDate = (next, { replace = false } = {}) => setParams(next === today ? {} : { date: next }, { replace });
  // Days before this have moved to the Archive (at 8 AM the next morning).
  const archived = date < archiveCutoffIn(timeZone, config.archive_hour);

  const [rides, setRides] = useState(null); // null = loading
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ key: "time", dir: "asc" });
  const [drivers, setDrivers] = useState([]);
  // null = form closed, { ride: null } = adding, { ride } = editing
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null); // ride pending deletion
  const [deleteScope, setDeleteScope] = useState(""); // "following" = this and later rides in its series
  const [hideCompleted, setHideCompleted] = useHideCompleted();
  const [sheet, setSheet] = useState(null); // "import" | "export": the Google Form dialogs

  // Drivers for the form's dropdown.
  useEffect(() => {
    driversApi.list().then(setDrivers).catch(() => {});
  }, []);

  // Only the newest request may update the page, so a slow answer for the
  // previous day can't land under this day's header.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const request = ++latest.current;
    if (archived) {
      setRides([]);
      return;
    }
    try {
      const list = await ridesApi.list(date);
      if (request !== latest.current) return;
      setRides(list);
      setError("");
    } catch (err) {
      if (request === latest.current) setError(err.message);
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

  const shown = (rides ?? []).filter((r) => !(hideCompleted && r.status === "completed"));
  const hiddenCount = (rides?.length ?? 0) - shown.length;
  const unassigned = shown.filter((r) => !r.driver);
  const assigned = shown.filter((r) => r.driver);
  const tableProps = {
    timeZone,
    sort,
    onSort: setSort,
    onEdit: (ride) => setEditing({ ride }),
    drivers, // for the small "off shift" marker
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
          <div className="sheet-actions">
            <button className="button-quiet" onClick={() => setSheet("import")}>Import</button>
            <button className="button-quiet" onClick={() => setSheet("export")}>Export</button>
          </div>
          <button className="button" onClick={() => setEditing({ ride: null })}>
            + Add ride
          </button>
        </div>
      </div>

      {rides && !archived && rides.length > 0 && (
        <div className="summary-row">
          <DaySummary rides={rides} />
          <label className="toggle">
            <input type="checkbox" checked={hideCompleted} onChange={(e) => setHideCompleted(e.target.checked)} />
            Hide completed
          </label>
        </div>
      )}

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
              <p>
                {rides.length === 0
                  ? "No rides on this day."
                  : shown.length === 0
                    ? "All of this day's rides are completed."
                    : hiddenCount > 0
                      ? "No other assigned rides."
                      : "No assigned rides on this day."}
              </p>
              {hiddenCount > 0 && (
                <button className="button-quiet" onClick={() => setHideCompleted(false)}>
                  Show {hiddenCount} completed
                </button>
              )}
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
              setDeleteScope("");
              setDeleting(ride);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete ride for ${deleting.rider_name}?` : ""}
        confirmLabel={deleteScope === "following" ? "Delete rides" : "Delete ride"}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await ridesApi.remove(deleting.id, deleteScope || undefined);
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
            {deleting.series && (
              <fieldset className="series-scope">
                <legend>This ride repeats</legend>
                <label className="toggle">
                  <input type="radio" name="delete-scope" checked={deleteScope === ""} onChange={() => setDeleteScope("")} />
                  Only this ride
                </label>
                <label className="toggle">
                  <input
                    type="radio"
                    name="delete-scope"
                    checked={deleteScope === "following"}
                    onChange={() => setDeleteScope("following")}
                  />
                  This and later rides in the series
                </label>
              </fieldset>
            )}
            <p className="muted">
              {deleteScope === "following" ? "Their links" : "The rider's link"} will stop working. This can't be undone.
            </p>
          </>
        )}
      </ConfirmDialog>
      <Modal
        open={sheet !== null}
        onClose={() => setSheet(null)}
        className={sheet === "import" ? "modal-import" : ""}
        title={sheet === "import" ? "Import from the Google Form" : "Export to the Google Form layout"}
      >
        {sheet === "import" && (
          <FormImport
            today={today}
            onClose={() => setSheet(null)}
            onDone={() => {
              setSheet(null);
              load();
            }}
          />
        )}
        {sheet === "export" && <FormExport date={date} onClose={() => setSheet(null)} />}
      </Modal>
    </section>
  );
}

// "1 unassigned · 2 on the way · 5 completed": the day at a glance.
function DaySummary({ rides }) {
  const count = (test) => rides.filter(test).length;
  const items = [
    { n: count((r) => !r.driver), label: "unassigned", tone: "warn" },
    { n: count((r) => r.status === "on_the_way"), label: "on the way", tone: "ok" },
    { n: count((r) => r.status === "not_confirmed"), label: "not started" },
    { n: count((r) => r.status === "completed"), label: "completed" },
  ];
  return (
    <p className="day-summary" aria-label="Day summary">
      {items.map((item) => (
        <span key={item.label} className={`day-stat${item.n > 0 && item.tone ? ` day-stat-${item.tone}` : ""}`}>
          <strong>{item.n}</strong> {item.label}
        </span>
      ))}
    </p>
  );
}

// "Hide completed" preference, remembered in this browser.
const HIDE_KEY = "rides.hideCompleted";
function useHideCompleted() {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === "true";
    } catch {
      return false;
    }
  });
  function update(next) {
    setValue(next);
    try {
      localStorage.setItem(HIDE_KEY, String(next));
    } catch {
      /* storage unavailable: just don't remember it */
    }
  }
  return [value, update];
}
