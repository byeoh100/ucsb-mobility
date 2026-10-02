// Phone numbers are stored as exactly 10 digits ("8055550123") and shown as
// (805) - 555 - 0123. Change the separators here to change them everywhere.

const AREA_CLOSE = ") - ";
const MIDDLE = " - ";

// Pull up to 10 digits out of whatever was typed or pasted.
// A leading US country code ("+1 805…") is dropped.
export function phoneDigits(text) {
  let digits = String(text ?? "").replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

// Format as the user types: "8" → "(8", "8055" → "(805) - 5", and so on.
// Separators only appear once a digit follows them, so backspacing feels natural.
export function formatPhone(value) {
  const d = phoneDigits(value);
  if (!d) return "";
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}${AREA_CLOSE}${d.slice(3)}`;
  return `(${d.slice(0, 3)}${AREA_CLOSE}${d.slice(3, 6)}${MIDDLE}${d.slice(6)}`;
}

export function isCompletePhone(digits) {
  return phoneDigits(digits).length === 10;
}
