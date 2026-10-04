import { useState } from "react";
import { ridesApi } from "../../api.js";
import PhoneInput from "../../components/PhoneInput.jsx";
import { Req, RequiredNote } from "../../components/Required.jsx";
import { isCompletePhone } from "../../lib/phone.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { campusParts } from "../../lib/time.js";

// "19:00" → "7:00 PM"
function timeLabel(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Add or edit a ride. Shown inside a Modal by RidesPage.
//
// Props:
//   ride         the ride being edited, or null to add one
//   defaultDate  "YYYY-MM-DD" for new rides (the day being viewed)
//   today        "YYYY-MM-DD" on campus
//   drivers      [{ id, name, color }] for the driver dropdown
//   timeZone     campus time zone
//   onSaved      (savedRide) => void
//   onCancel     () => void
//   onDelete     (ride) => void, edit mode only; the page asks for confirmation
export default function RideForm({ ride, defaultDate, today, drivers, timeZone, onSaved, onCancel, onDelete }) {
  const isEdit = Boolean(ride);
  // Hours of operation come from the server (SERVICE_START / SERVICE_END).
  const { config } = useAuth();
  const EARLIEST = config.service_hours?.start ?? "07:00";
  const LATEST = config.service_hours?.end ?? "19:00";
  const original = isEdit ? campusParts(ride.pickup_time, timeZone) : null;

  const [riderName, setRiderName] = useState(ride?.rider_name ?? "");
  const [phone, setPhone] = useState(ride?.rider_phone ?? "");
  const [email, setEmail] = useState(ride?.rider_email ?? "");
  const [date, setDate] = useState(original?.date ?? defaultDate);
  const [time, setTime] = useState(original?.time ?? "");
  const [pickup, setPickup] = useState(ride?.pickup_name ?? "");
  const [dropoff, setDropoff] = useState(ride?.dropoff_name ?? "");
  const [driverId, setDriverId] = useState(ride?.driver ?? "");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const timeChanged = !isEdit || date !== original.date || time !== original.time;
  const selectedDriver = drivers.find((d) => String(d.id) === String(driverId));

  // Editing a field clears its error (and any form-level error).
  function edit(field, setter) {
    return (value) => {
      setter(value);
      setErrors(({ [field]: _, form: __, non_field_errors: ___, ...rest }) => rest);
    };
  }

  function checkLocally() {
    const found = {};
    if (!riderName.trim()) found.rider_name = "Enter the rider's name.";
    if (!isCompletePhone(phone)) found.rider_phone = "Enter all 10 digits.";
    if (!email.trim()) found.rider_email = "Enter the rider's UCSB email.";
    if (!date || !time) found.pickup_time = "Enter a date and time.";
    // Hours are only checked when the time changes (like the server), so a ride
    // booked before the hours changed can still be edited, e.g. reassigned.
    else if (timeChanged && (time < EARLIEST || time > LATEST)) found.pickup_time = `Rides must be between ${timeLabel(EARLIEST)} and ${timeLabel(LATEST)}.`;
    else if (timeChanged && date < today) found.pickup_time = "That date has already passed.";
    if (!pickup.trim()) found.pickup_name = "Enter where to pick them up.";
    if (!dropoff.trim()) found.dropoff_name = "Enter where to drop them off.";
    return found;
  }

  async function submit(e) {
    e.preventDefault();
    const found = checkLocally();
    setErrors(found);
    if (Object.keys(found).length) return;

    const data = {
      rider_name: riderName.trim(),
      rider_phone: phone,
      rider_email: email.trim(),
      pickup_name: pickup.trim(),
      dropoff_name: dropoff.trim(),
      driver: driverId === "" ? null : Number(driverId),
    };
    // Sent without a time zone: the server reads it as campus time.
    // Only sent when changed, so editing an old ride doesn't trip date checks.
    if (timeChanged) data.pickup_time = `${date}T${time}`;

    setBusy(true);
    try {
      const saved = await (isEdit ? ridesApi.update(ride.id, data) : ridesApi.create(data));
      onSaved(saved);
    } catch (err) {
      const fieldErrors = Object.fromEntries(
        Object.entries(err.data || {})
          .filter(([, msgs]) => Array.isArray(msgs))
          .map(([field, msgs]) => [field, msgs[0]])
      );
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: err.message });
      setBusy(false);
    }
  }

  const error = (field) => errors[field] && <span className="field-error">{errors[field]}</span>;

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <RequiredNote />
      <fieldset className="form-section">
        <legend>Rider</legend>
        <label className="field">
          <span>Name <Req /></span>
          <input value={riderName} onChange={(e) => edit("rider_name", setRiderName)(e.target.value)} autoComplete="off" autoFocus aria-required="true" />
          {error("rider_name")}
        </label>
        <div className="form-row">
          <label className="field">
            <span>Phone <Req /></span>
            <PhoneInput value={phone} onChange={edit("rider_phone", setPhone)} autoComplete="off" aria-required="true" />
            {error("rider_phone")}
          </label>
          <label className="field">
            <span>UCSB email <Req /></span>
            <input
              aria-required="true"
              type="email"
              value={email}
              onChange={(e) => edit("rider_email", setEmail)(e.target.value)}
              placeholder="name@umail.ucsb.edu"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            {error("rider_email")}
          </label>
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>Ride</legend>
        <div className="form-row">
          <label className="field">
            <span>Date <Req /></span>
            <input aria-required="true" type="date" value={date} min={isEdit ? undefined : today} onChange={(e) => edit("pickup_time", setDate)(e.target.value)} />
          </label>
          <label className="field">
            <span>Pickup time <Req /></span>
            <input
              aria-required="true"
              type="time"
              value={time}
              min={EARLIEST}
              max={LATEST}
              step={300}
              onChange={(e) => edit("pickup_time", setTime)(e.target.value)}
            />
          </label>
        </div>
        {error("pickup_time")}
        <div className="form-row">
          <label className="field">
            <span>From <Req /></span>
            <input aria-required="true" value={pickup} onChange={(e) => edit("pickup_name", setPickup)(e.target.value)} placeholder="e.g. Davidson Library" />
            {error("pickup_name")}
          </label>
          <label className="field">
            <span>To <Req /></span>
            <input aria-required="true" value={dropoff} onChange={(e) => edit("dropoff_name", setDropoff)(e.target.value)} placeholder="e.g. Campbell Hall" />
            {error("dropoff_name")}
          </label>
        </div>
        <label className="field">
          Driver
          <span className="driver-select">
            <span
              className="swatch"
              style={{ background: selectedDriver?.color ?? "transparent" }}
              aria-hidden="true"
            />
            <select value={driverId} onChange={(e) => edit("driver", setDriverId)(e.target.value)}>
              <option value="">Unassigned</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </span>
          {error("driver")}
        </label>
      </fieldset>

      {(errors.form || errors.non_field_errors) && (
        <p className="error" role="alert">{errors.form || errors.non_field_errors}</p>
      )}

      <div className="modal-actions">
        {isEdit && onDelete && (
          <button
            type="button"
            className="button-quiet button-quiet-danger actions-left"
            onClick={() => onDelete(ride)}
            disabled={busy}
          >
            Delete ride
          </button>
        )}
        <button type="button" className="button-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add ride"}
        </button>
      </div>
    </form>
  );
}
