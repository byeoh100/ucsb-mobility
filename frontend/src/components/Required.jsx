// Marks a required field. The asterisk is visual only; screen readers get
// "required" from aria-required on the input instead of hearing "star".
export function Req() {
  return (
    <span className="req" aria-hidden="true">
      *
    </span>
  );
}

// The line at the top of a form that explains the asterisk.
export function RequiredNote() {
  return (
    <p className="required-note">
      Fields marked <Req /> are required.
    </p>
  );
}
