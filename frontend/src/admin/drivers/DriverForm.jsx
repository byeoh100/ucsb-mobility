import { useState } from "react";
import { driversApi } from "../../api.js";
import PhoneInput from "../../components/PhoneInput.jsx";
import { Req, RequiredNote } from "../../components/Required.jsx";
import { isCompletePhone } from "../../lib/phone.js";
import ColorPicker from "./ColorPicker.jsx";

// Add or edit a driver. Shown inside a Modal by DriversPage.
//
// Props:
//   driver    the driver being edited, or null to add a new one
//   drivers   all drivers (to know which colors are taken)
//   colors    [{ value, label }]
//   onSaved   () => void, after a successful save
//   onCancel  () => void
export default function DriverForm({ driver, drivers, colors, onSaved, onCancel }) {
  const isEdit = Boolean(driver);

  const takenBy = Object.fromEntries(
    drivers.filter((d) => d.id !== driver?.id).map((d) => [d.color, d.name])
  );
  const firstFree = colors.find((c) => !takenBy[c.value])?.value ?? "";

  const [name, setName] = useState(driver?.name ?? "");
  const [email, setEmail] = useState(driver?.email ?? "");
  const [phone, setPhone] = useState(driver?.phone ?? "");
  const [color, setColor] = useState(driver?.color ?? firstFree);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  // Editing a field clears its error (and any form-level error).
  function edit(field, setter) {
    return (value) => {
      setter(value);
      setErrors(({ [field]: _, form: __, non_field_errors: ___, ...rest }) => rest);
    };
  }

  function checkLocally() {
    const found = {};
    if (!name.trim()) found.name = "Enter the driver's name.";
    if (!email.trim()) found.email = "Enter their UCSB email.";
    if (phone && !isCompletePhone(phone)) found.phone = "Enter all 10 digits, or leave it blank.";
    if (!color) found.color = "Choose a color.";
    return found;
  }

  async function submit(e) {
    e.preventDefault();
    const found = checkLocally();
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    const data = { name: name.trim(), email: email.trim(), phone, color };
    try {
      await (isEdit ? driversApi.update(driver.id, data) : driversApi.create(data));
      onSaved();
    } catch (err) {
      // DRF sends { field: ["message"] } for validation problems.
      const fieldErrors = Object.fromEntries(
        Object.entries(err.data || {})
          .filter(([, msgs]) => Array.isArray(msgs))
          .map(([field, msgs]) => [field, msgs[0]])
      );
      setErrors(Object.keys(fieldErrors).length ? fieldErrors : { form: err.message });
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <RequiredNote />
      <label className="field">
        <span>Name <Req /></span>
        <input aria-required="true" value={name} onChange={(e) => edit("name", setName)(e.target.value)} autoComplete="off" autoFocus />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </label>

      <label className="field">
        <span>UCSB email <Req /></span>
        <input
          aria-required="true"
          type="email"
          value={email}
          onChange={(e) => edit("email", setEmail)(e.target.value)}
          placeholder="name@umail.ucsb.edu"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <span className="hint">They'll sign in with the Google account for this email.</span>
        {errors.email && <span className="field-error">{errors.email}</span>}
      </label>

      <label className="field">
        <span>
          Phone <span className="optional">optional</span>
        </span>
        <PhoneInput value={phone} onChange={edit("phone", setPhone)} />
        {errors.phone && <span className="field-error">{errors.phone}</span>}
      </label>

      <ColorPicker colors={colors} takenBy={takenBy} value={color} onChange={edit("color", setColor)} error={errors.color} required />

      {(errors.form || errors.non_field_errors) && (
        <p className="error" role="alert">{errors.form || errors.non_field_errors}</p>
      )}

      <div className="modal-actions">
        <button type="button" className="button-quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button" disabled={busy || !color}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Add driver"}
        </button>
      </div>
    </form>
  );
}
