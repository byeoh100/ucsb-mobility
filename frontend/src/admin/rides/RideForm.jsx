import { useState } from "react";
import { ridesApi } from "../../api.js";
import PhoneInput from "../../components/PhoneInput.jsx";
import TimeSelect from "../../components/TimeSelect.jsx";
import RepeatFields, { repeatDates, repeatProblem, weekdayOf } from "./RepeatFields.jsx";
import { shiftDate } from "../../lib/time.js";
import { onShift } from "../../lib/shifts.js";
import { Req, RequiredNote } from "../../components/Required.jsx";
import { isCompletePhone } from "../../lib/phone.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { campusParts } from "../../lib/time.js";

// "19:00" → "7:00 PM"
function timeLabel(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "Add ride", or "Add 6 rides" when repeating.
function submitLabel(repeat, date) {
  const count = repeat && !repeatProblem(date, repeat.days, repeat.until) ? repeatDates(date, repeat.days, repeat.until).length : 1;
  return count > 1 ? `Add ${count} rides` : "Add ride";
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
  const [notes, setNotes] = useState(ride?.notes ?? "");
  const [driverId, setDriverId] = useState(ride?.driver ?? "");
  // New rides: repeat on some weekdays until a date (see RepeatFields).
  const [repeat, setRepeat] = useState(null); // null = off, else { days, until }
  // Editing a repeating ride: "" = only this ride, "following" = this and later rides.
  const [scope, setScope] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const timeChanged = !isEdit || date !== original.date || time !== original.time;
  const selectedDriver = drivers.find((d) => String(d.id) === String(driverId));
  const onShiftDrivers = drivers.filter((d) => onShift(d, date, time));
  const otherDrivers = drivers.filter((d) => !onShiftDrivers.includes(d));

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
    if (!date || !time) found.pickup_time = "Enter a date and time.";
    // Hours are only checked when the time changes (like the server), so a ride
    // booked before the hours changed can still be edited, e.g. reassigned.
    else if (timeChanged && (time < EARLIEST || time > LATEST)) found.pickup_time = `Rides must be between ${timeLabel(EARLIEST)} and ${timeLabel(LATEST)}.`;
    else if (timeChanged && date < today) found.pickup_time = "That date has already passed.";
    if (!pickup.trim()) found.pickup_name = "Enter where to pick them up.";
    if (!dropoff.trim()) found.dropoff_name = "Enter where to drop them off.";
    if (repeat && date) {
      const problem = repeatProblem(date, repeat.days, repeat.until);
      if (problem) found.repeat = problem;
    }
    if (scope === "following" && date !== original.date)
      found.pickup_time = "To move a repeating ride to another day, choose \"Only this ride\".";
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
      notes: notes.trim(),
      driver: driverId === "" ? null : Number(driverId),
    };
    // Sent without a time zone: the server reads it as campus time.
    // Only sent when changed, so editing an old ride doesn't trip date checks.
    if (timeChanged) data.pickup_time = `${date}T${time}`;
    if (repeat) data.repeat = repeat;

    setBusy(true);
    try {
      const saved = await (isEdit ? ridesApi.update(ride.id, data, scope || undefined) : ridesApi.create(data));
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
            <span>
              UCSB email <span className="optional">optional</span>
            </span>
            <input
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
          {/* A div, not a label: the time is two dropdowns (see TimeSelect). */}
          <div className="field">
            <span aria-hidden="true">Pickup time <Req /></span>
            <TimeSelect
              label="Pickup time"
              value={time}
              earliest={EARLIEST}
              latest={LATEST}
              onChange={edit("pickup_time", setTime)}
            />
          </div>
        </div>
        {error("pickup_time")}
        {!isEdit && (
          <div className="repeat">
            <label className="toggle">
              <input
                type="checkbox"
                checked={repeat !== null}
                onChange={(e) => {
                  // Start with the first ride's weekday, for four weeks.
                  setRepeat(e.target.checked ? { days: [weekdayOf(date)], until: shiftDate(date, 27) } : null);
                  setErrors(({ repeat: _, ...rest }) => rest);
                }}
              />
              Repeat this ride
            </label>
            {repeat && (
              <RepeatFields
                start={date}
                days={repeat.days}
                until={repeat.until}
                onChange={edit("repeat", setRepeat)}
                error={errors.repeat}
              />
            )}
          </div>
        )}
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
          <span>
            Notes <span className="optional">optional</span>
          </span>
          <textarea
            value={notes}
            onChange={(e) => edit("notes", setNotes)(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="From the rider, e.g. meet at the side door"
          />
          {error("notes")}
        </label>
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
              {/* Drivers on shift at this ride's time come first. Only a guide:
                  anyone can be picked (extra hours, standby). */}
              {onShiftDrivers.length > 0 ? (
                <>
                  <optgroup label="On shift">
                    {onShiftDrivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name} · on shift</option>
                    ))}
                  </optgroup>
                  <optgroup label="Everyone else">
                    {otherDrivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </optgroup>
                </>
              ) : (
                drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))
              )}
            </select>
          </span>
          {error("driver")}
        </label>
      </fieldset>

      {isEdit && ride.series && (
        <fieldset className="form-section series-scope">
          <legend>Repeating ride</legend>
          <label className="toggle">
            <input type="radio" name="scope" checked={scope === ""} onChange={() => setScope("")} />
            Only this ride
          </label>
          <label className="toggle">
            <input type="radio" name="scope" checked={scope === "following"} onChange={() => setScope("following")} />
            This and later rides in the series
          </label>
          {scope === "following" && (
            <p className="hint">Later rides keep their own dates. Rides already started are left alone.</p>
          )}
        </fieldset>
      )}

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
          {busy ? "Saving…" : isEdit ? "Save changes" : submitLabel(repeat, date)}
        </button>
      </div>
    </form>
  );
}
