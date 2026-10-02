import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";

// "Are you sure?" dialog for destructive actions (removing drivers, deleting rides).
//
// Props:
//   open          whether it's showing
//   title         e.g. "Remove Dana Ortiz?"
//   children      explanation of what will happen
//   confirmLabel  button text, e.g. "Remove driver"
//   onConfirm     async () => void. Throw to show an error and keep the dialog open.
//   onClose       () => void, for Cancel / Escape / after success
export default function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Start clean each time it opens.
  useEffect(() => {
    if (open) {
      setBusy(false);
      setError("");
    }
  }, [open]);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title}>
      <div className="stack">
        <div className="confirm-body">{children}</div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          {/* Cancel gets focus first so Enter doesn't destroy anything by accident. */}
          <button type="button" className="button-quiet" onClick={onClose} disabled={busy} autoFocus>
            Cancel
          </button>
          <button type="button" className="button button-danger" onClick={confirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
