import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toMinutes } from "../../lib/shifts.js";
import { driversApi } from "../../api.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Modal from "../../components/Modal.jsx";
import DriverForm from "./DriverForm.jsx";
import DriverProfile, { ProfileHeader } from "./DriverProfile.jsx";
import DriverTable from "./DriverTable.jsx";
import ShiftSchedule from "./ShiftSchedule.jsx";
import ShiftStatus from "./ShiftStatus.jsx";
import { useShiftEditing, useShiftSaver } from "./useShiftEditing.js";

// Admin → Drivers, with two tabs:
//   Drivers  the list; click a driver for the driver modal (ride counts, shifts)
//   Shifts   everyone's week at once, to spot gaps (?tab=shifts)
// Owns the data; child components display and edit it.
export default function DriversPage() {
  const { config } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "shifts" ? "shifts" : "drivers";
  const [drivers, setDrivers] = useState(null); // null = loading
  const [colors, setColors] = useState([]);
  const [error, setError] = useState("");
  // The driver modal: null = closed, or { id, form, back }: form = showing the
  // details form (id null = adding a driver); back = it was opened from the
  // profile, so Cancel and Save return there.
  const [open, setOpen] = useState(null);
  const [removing, setRemoving] = useState(null); // driver pending removal
  const [editShifts, setEditShifts] = useState(false);
  const hours = config.service_hours ?? { start: "07:00", end: "19:00" };
  const from = toMinutes(hours.start);
  const to = toMinutes(hours.end);

  // When each driver's shifts were last saved, so a list refresh that left
  // before the save landed can't put their old shifts back.
  const savedAt = useRef({});
  const replaceDriver = (saved) => {
    savedAt.current[saved.id] = Date.now();
    setDrivers((list) => list.map((d) => (d.id === saved.id ? saved : d)));
  };
  const saver = useShiftSaver(replaceDriver);
  const edit = useShiftEditing({
    from, to, editing: tab === "shifts" && editShifts,
    weekOf: (id) => saver.weekOf(drivers.find((d) => d.id === id)),
    save: saver.save,
  });
  const openDriver = open?.id != null ? drivers?.find((d) => d.id === open.id) : null;

  const load = useCallback(async () => {
    const started = Date.now();
    try {
      const [driverList, colorList] = await Promise.all([driversApi.list(), driversApi.colors()]);
      setDrivers((current) =>
        driverList.map((d) => {
          const mine = current?.find((c) => c.id === d.id);
          return mine && (savedAt.current[d.id] ?? 0) > started ? { ...d, shifts: mine.shifts } : d;
        })
      );
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
          {tab === "shifts" ? (
            <label className="switch">
              <input
                type="checkbox"
                role="switch"
                checked={editShifts}
                onChange={(e) => setEditShifts(e.target.checked)}
                disabled={!drivers?.length}
              />
              <span className="switch-track" aria-hidden="true" />
              Edit shifts
            </label>
          ) : (
            <button
              className="button"
              onClick={() => setOpen({ id: null, form: true })}
              disabled={!drivers || allColorsTaken}
              title={allColorsTaken ? `All ${colors.length} colors are in use` : undefined}
            >
              + Add driver
            </button>
          )}
        </div>
      </div>

      <div className="segmented sliding page-tabs" role="tablist" aria-label="Drivers or shifts">
        <span className={`segmented-thumb${tab === "shifts" ? " at-end" : ""}`} aria-hidden="true" />
        <button role="tab" aria-selected={tab === "drivers"} onClick={() => setParams({}, { replace: true })}>
          Drivers
        </button>
        <button
          role="tab"
          aria-selected={tab === "shifts"}
          onClick={() => {
            setEditShifts(false);
            setParams({ tab: "shifts" }, { replace: true });
          }}
        >
          Shifts
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error} <button className="button-quiet" onClick={load}>Try again</button>
        </p>
      )}
      {drivers === null && !error && <p className="muted">Loading drivers…</p>}
      {drivers && tab === "drivers" && (
        <DriverTable
          drivers={drivers}
          colors={colors}
          timeZone={config.time_zone}
          onOpen={(driver) => setOpen({ id: driver.id, form: false })}
        />
      )}
      {drivers && tab === "shifts" && (
        drivers.length === 0 ? (
          <div className="empty-state">
            <p>No drivers yet.</p>
            <p className="muted">Add drivers on the Drivers tab, then set their shifts here.</p>
          </div>
        ) : (
          <div className="stack">
            <ShiftSchedule drivers={drivers} from={from} to={to} editing={editShifts} edit={edit} />
            <ShiftStatus
              editing={editShifts}
              saver={saver}
              empty={drivers.every((d) => d.shifts.length === 0)}
              emptyText="No shifts yet. Right-click a day (or press and hold on a phone) to add one."
            />
          </div>
        )
      )}

      {/* The driver modal: their profile, or the details form */}
      <Modal
        open={open !== null && (open.id === null || Boolean(openDriver))}
        onClose={() => setOpen(null)}
        wide={!open?.form}
        className={open?.form ? "" : "modal-profile"}
        title={
          open?.id === null ? "Add driver"
          : open?.form ? `Edit ${openDriver?.name}`
          : openDriver && <ProfileHeader driver={openDriver} onEdit={() => setOpen({ id: open.id, form: true, back: true })} />
        }
      >
        {open?.form && (
          <DriverForm
            // Fresh form state each time it opens.
            key={open.id ?? "new"}
            driver={openDriver}
            drivers={drivers}
            colors={colors}
            onCancel={() => setOpen(open.back ? { id: open.id, form: false } : null)}
            onSaved={() => {
              setOpen(open.back ? { id: open.id, form: false } : null);
              load();
            }}
          />
        )}
        {open && !open.form && openDriver && (
          <DriverProfile
            key={openDriver.id}
            driver={openDriver}
            from={from}
            to={to}
            onSaved={replaceDriver}
            onRemove={() => setRemoving(openDriver)}
            onClose={() => setOpen(null)}
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
          setOpen(null);
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
