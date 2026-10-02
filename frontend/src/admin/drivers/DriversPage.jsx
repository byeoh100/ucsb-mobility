import { useCallback, useEffect, useState } from "react";
import { driversApi } from "../../api.js";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import Modal from "../../components/Modal.jsx";
import DriverForm from "./DriverForm.jsx";
import DriverTable from "./DriverTable.jsx";

// Admin → Drivers. Owns the data; child components display and edit it.
export default function DriversPage() {
  const [drivers, setDrivers] = useState(null); // null = loading
  const [colors, setColors] = useState([]);
  const [error, setError] = useState("");
  // null = form closed, { driver: null } = adding, { driver } = editing
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null); // driver pending removal

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

  useEffect(() => {
    load();
  }, [load]);

  const allColorsTaken = drivers && colors.length > 0 && drivers.length >= colors.length;

  return (
    <section className="stack">
      <div className="page-header">
        <h1>
          Drivers {drivers && <span className="count">{drivers.length}</span>}
        </h1>
        <button
          className="button"
          onClick={() => setEditing({ driver: null })}
          disabled={!drivers || allColorsTaken}
          title={allColorsTaken ? "All 12 colors are in use" : undefined}
        >
          + Add driver
        </button>
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
          onEdit={(driver) => setEditing({ driver })}
          onRemove={setRemoving}
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
