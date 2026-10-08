import { useEffect, useRef } from "react";
import Modal from "./Modal.jsx";

// A big, thumb-friendly yes/no check for small buttons that sit close together
// ("Remove?", "Call 805-555-0100?"): the question, then ✓ and ✕ halves that
// form the bottom of the dialog.
//
// Props:
//   open, onClose
//   title         the question
//   yesLabel      what ✓ does, for screen readers ("Yes, remove")
//   onConfirm     () => void, for an action; or
//   confirmHref   a link to follow instead (e.g. tel:)
export default function QuickConfirm({ open, onClose, title, yesLabel, onConfirm, confirmHref }) {
  // Cancel gets focus first, so a stray Enter does nothing. (Runs after the
  // dialog opens, which would otherwise focus ✓, the first button.)
  const cancel = useRef(null);
  useEffect(() => {
    if (open) cancel.current?.focus();
  }, [open]);

  const yes = {
    className: "quick-yes",
    "aria-label": yesLabel,
    onClick: () => {
      onClose();
      onConfirm?.();
    },
  };
  return (
    <Modal open={open} onClose={onClose} title={title} className="quick-confirm">
      <div className="quick-confirm-actions">
        {confirmHref ? (
          <a href={confirmHref} {...yes}>✓</a>
        ) : (
          <button type="button" {...yes}>✓</button>
        )}
        <button type="button" className="quick-no" aria-label="Cancel" onClick={onClose} ref={cancel}>
          ✕
        </button>
      </div>
    </Modal>
  );
}
