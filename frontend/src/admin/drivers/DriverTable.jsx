import { formatPhone } from "../../lib/phone.js";

// List of drivers with Edit and Remove actions per row.
//
// Props:
//   drivers   array of { id, name, email, phone, color }
//   colors    array of { value, label }, used to name each driver's color
//   onEdit    (driver) => void
//   onRemove  (driver) => void
export default function DriverTable({ drivers, colors, onEdit, onRemove }) {
  const colorName = Object.fromEntries(colors.map((c) => [c.value, c.label]));

  if (drivers.length === 0) {
    return (
      <div className="empty-state">
        <p>No drivers yet.</p>
        <p className="muted">Drivers you add here can sign in with their UCSB Google account.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="col-color">Color</th>
            <th>Name</th>
            <th>UCSB email</th>
            <th>Phone</th>
            <th>Current ride</th>
            <th className="col-actions"><span className="visually-hidden">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.id}>
              <td className="col-color">
                <span
                  className="swatch"
                  style={{ background: d.color }}
                  title={colorName[d.color] || d.color}
                  aria-label={colorName[d.color] || d.color}
                  role="img"
                />
              </td>
              <td className="strong">{d.name}</td>
              <td>{d.email}</td>
              <td className="nowrap">{formatPhone(d.phone) || <span className="muted">—</span>}</td>
              {/* Filled in once rides exist. */}
              <td className="muted">—</td>
              <td className="col-actions">
                <button className="button-quiet" onClick={() => onEdit(d)} aria-label={`Edit ${d.name}`}>
                  Edit
                </button>
                <button
                  className="button-quiet button-quiet-danger"
                  onClick={() => onRemove(d)}
                  aria-label={`Remove ${d.name}`}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
