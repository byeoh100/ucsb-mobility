import { Req } from "../../components/Required.jsx";

// Pick one of the 12 preset driver colors. Colors another driver already uses
// are grayed out and can't be chosen; hovering shows who has them.
//
// Props:
//   colors    [{ value, label }]
//   takenBy   { [colorValue]: driverName } for colors other drivers use
//   value     selected color value
//   onChange  (colorValue) => void
export default function ColorPicker({ colors, takenBy, value, onChange, error, required = false }) {
  const selected = colors.find((c) => c.value === value);
  const allTaken = colors.every((c) => takenBy[c.value]);

  return (
    <fieldset className="field color-picker" aria-required={required || undefined}>
      <legend>
        Color {required && <Req />}
      </legend>
      <div className="swatch-grid">
        {colors.map((c) => {
          const owner = takenBy[c.value];
          return (
            <label
              key={c.value}
              className={`swatch-option${owner ? " taken" : ""}${c.value === value ? " selected" : ""}`}
              title={owner ? `${c.label} (${owner})` : c.label}
            >
              <input
                type="radio"
                name="driver-color"
                value={c.value}
                checked={c.value === value}
                disabled={Boolean(owner)}
                onChange={() => onChange(c.value)}
                className="visually-hidden"
              />
              <span className="swatch-large" style={{ background: c.value }} aria-hidden="true" />
              <span className="visually-hidden">
                {c.label}
                {owner ? `, used by ${owner}` : ""}
              </span>
            </label>
          );
        })}
      </div>
      <p className="hint">
        {allTaken
          ? "All 12 colors are in use. Remove a driver or change their color to free one up."
          : selected
            ? selected.label
            : "Choose a color"}
      </p>
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}
