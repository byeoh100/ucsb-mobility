import { useCallback, useEffect, useState } from "react";
import { toMinutes } from "../../lib/shifts.js";
import { driversApi } from "../../api.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Modal from "../../components/Modal.jsx";
import DriverForm from "./DriverForm.jsx";
import DriverTable from "./DriverTable.jsx";

// Admin → Drivers. Owns the data; child components display and edit it.
export default function DriversPage() {
  const { config } = useAuth();
  const [drivers, setDrivers] = useState(null); // null = loading
  const [colors, setColors] = useState([]);
  const [error, setError] = useState("");
  // null = form closed, { driver: null } = adding, { driver } = editing
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null); // driver pending removal
  const [showShifts, setShowShifts] = useState(false);
  const [editShifts, setEditShifts] = useState(false);
  // The one highlighted shift on the page ({ driverId, key }), if any.
  const [selectedShift, setSelectedShift] = useState(null);

  // Clicking anywhere that isn't a shift clears the highlight. (A click on a
  // shift highlights that one instead; the timeline handles it.)
  useEffect(() => {
    if (!editShifts) {
      setSelectedShift(null);
      return;
    }
    const clear = (e) => !e.target.closest?.(".shift-block") && setSelectedShift(null);
    document.addEventListener("pointerdown", clear);
    return () => document.removeEventListener("pointerdown", clear);
  }, [editShifts]);
  const hours = config.service_hours ?? { start: "07:00", end: "19:00" };

  const load = useCallback(async () => {
    try {
      const [driverList, colorList] = await Promise.all([driversApi.list(), driversApi.colors()]);
      setDrivers(driverList);
      setColors(colorList);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Refresh every 30 seconds while visible, so "Current ride" stays current.
  useEffect(() => {
    load();
    const refresh = () => document.visibilityState === "visible" && load();
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const allColorsTaken = drivers && colors.length > 0 && drivers.length >= colors.length;

  return (
    <section className="stack">
      <div className="page-header">
        <h1>
          Drivers {drivers && <span className="count">{drivers.length}</span>}
        </h1>
        <div className="page-actions">
          {/* Show shifts fills in while on, and the Edit shifts switch slides out of it. */}
          <div className={`shift-controls${showShifts ? " on" : ""}`}>
            <button
              type="button"
              className="shift-toggle"
              aria-pressed={showShifts}
              onClick={() => {
                setShowShifts(!showShifts);
                setEditShifts(false);
              }}
            >
              {showShifts ? "Hide shifts" : "Show shifts"}
            </button>
            <div className="shift-edit-slide" aria-hidden={!showShifts}>
              <label className="switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={editShifts}
                  disabled={!showShifts}
                  tabIndex={showShifts ? 0 : -1}
                  onChange={(e) => setEditShifts(e.target.checked)}
                />
                <span className="switch-track" aria-hidden="true" />
                Edit shifts
              </label>
            </div>
          </div>
          <button
            className="button"
            onClick={() => setEditing({ driver: null })}
            disabled={!drivers || allColorsTaken}
            title={allColorsTaken ? `All ${colors.length} colors are in use` : undefined}
          >
            + Add driver
          </button>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error} <button className="button-quiet" onClick={load}>Try again</button>
        </p>
      )}
      {drivers === null && !error && <p className="muted">Loading drivers…</p>}
      {drivers && (
        <DriverTable
          drivers={drivers}
          colors={colors}
          timeZone={config.time_zone}
          onEdit={(driver) => setEditing({ driver })}
          onRemove={setRemoving}
          shifts={
            showShifts && {
              from: toMinutes(hours.start),
              to: toMinutes(hours.end),
              editing: editShifts,
              selected: selectedShift,
              onSelect: setSelectedShift,
              onSaved: (saved) => setDrivers((list) => list.map((d) => (d.id === saved.id ? saved : d))),
            }
          }
        />
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.driver ? `Edit ${editing.driver.name}` : "Add driver"}
      >
        {editing && (
          <DriverForm
            // Fresh form state each time it opens.
            key={editing.driver?.id ?? "new"}
            driver={editing.driver}
            drivers={drivers}
            colors={colors}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              load();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove ${removing.name}?` : ""}
        confirmLabel="Remove driver"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            await driversApi.remove(removing.id);
          } catch (err) {
            // Already gone (e.g. removed in another tab): that's the outcome we wanted.
            if (err.status !== 404) throw err;
          }
          await load();
        }}
      >
        {removing && (
          <>
            <p>
              <strong>{removing.email}</strong> will lose driver access right away.
            </p>
            <p className="muted">
              Any rides assigned to them will become unassigned. Their color will be free for another driver.
            </p>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
