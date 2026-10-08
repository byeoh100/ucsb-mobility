import { useEffect, useRef } from "react";
import Modal from "./Modal.jsx";

// A quick yes/no check for small buttons that sit close together ("Remove?",
// "Call 805-555-0100?", "Reopen?"): the app's usual dialog with ✕ and ✓
// buttons. A tap outside, Escape, or ✕ cancels.
//
// Props:
//   open, onClose
//   title         the question (text, or text with a highlighted part)
//   yesLabel      what ✓ does, for screen readers ("Yes, remove")
//   onConfirm     () => void, for an action; or
//   confirmHref   a link to follow instead (e.g. tel:)
export default function QuickConfirm({ open, onClose, title, yesLabel, onConfirm, confirmHref }) {
  // Cancel gets focus first, so a stray Enter does nothing. (Runs after the
  // dialog opens, which would otherwise focus the first button.)
  const cancel = useRef(null);
  useEffect(() => {
    if (open) cancel.current?.focus();
  }, [open]);

  const yes = {
    className: "button quick-yes",
    "aria-label": yesLabel,
    onClick: () => {
      onClose();
      onConfirm?.();
    },
  };
  return (
    <Modal open={open} onClose={onClose} title={title} className="quick-confirm" closeOnBackdrop>
      <div className="modal-actions">
        <button type="button" className="button-quiet quick-no" aria-label="Cancel" onClick={onClose} ref={cancel}>
          ✕
        </button>
        {confirmHref ? (
          <a href={confirmHref} {...yes}>✓</a>
        ) : (
          <button type="button" {...yes}>✓</button>
        )}
      </div>
    </Modal>
  );
}
