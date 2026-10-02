import { useLayoutEffect, useRef } from "react";
import { formatPhone, phoneDigits } from "../lib/phone.js";

// Text box that accepts at most 10 digits and formats them as you type:
// (805) - 555 - 0123. The parent gets plain digits ("8055550123").
//
// Props: value (digits), onChange(digits), plus any normal <input> props.

function digitCount(text) {
  return (text.match(/\d/g) || []).length;
}

// Index in the formatted string just after the nth digit.
function caretAfterDigits(formatted, n) {
  if (n === 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]) && ++seen === n) return i + 1;
  }
  return formatted.length;
}

export default function PhoneInput({ value, onChange, ...inputProps }) {
  const input = useRef(null);
  const pendingCaret = useRef(null); // digits that should sit before the caret
  const formatted = formatPhone(value);

  function handleChange(e) {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    let before = digitCount(raw.slice(0, caret));
    let digits = phoneDigits(raw);

    // Backspace/delete that only removed a separator ("-", ")", space)
    // wouldn't change the digits, so remove the digit before the caret instead.
    if (digits === value && raw.length < formatted.length && before > 0) {
      digits = value.slice(0, before - 1) + value.slice(before);
      before -= 1;
    }
    // A dropped leading "1" (country code) shifts everything left by one.
    if (raw.replace(/\D/g, "").length > 10 && raw.replace(/\D/g, "").startsWith("1")) {
      before = Math.max(0, before - 1);
    }

    pendingCaret.current = Math.min(before, digits.length);
    onChange(digits);
  }

  // Reformatting moves the caret to the end; put it back after the same digit.
  useLayoutEffect(() => {
    const el = input.current;
    if (pendingCaret.current === null || !el || document.activeElement !== el) return;
    const pos = caretAfterDigits(el.value, pendingCaret.current);
    el.setSelectionRange(pos, pos);
    pendingCaret.current = null;
  });

  return (
    <input
      ref={input}
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      placeholder="(805) - 555 - 0123"
      {...inputProps}
      value={formatted}
      onChange={handleChange}
    />
  );
}
