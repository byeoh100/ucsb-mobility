// "Saving…" / "Saved" / an error, under a shift editor while Edit shifts is on.
//
// Props: editing, saver (useShiftSaver), empty (no shifts at all)
export default function ShiftStatus({ editing, saver, empty }) {
  if (!editing) return null;
  return (
    <p className="hint shift-status" aria-live="polite">
      {saver.error ? (
        <span className="error">Couldn't save: {saver.error}</span>
      ) : saver.status === "saving" ? (
        "Saving…"
      ) : saver.status === "saved" ? (
        "Saved"
      ) : empty ? (
        "No shifts yet. Right-click a day (or press and hold on a phone) to add one."
      ) : null}
    </p>
  );
}
