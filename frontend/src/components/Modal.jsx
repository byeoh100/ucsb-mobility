import { useEffect, useId, useRef } from "react";

// Centered dialog built on the native <dialog> element, which handles focus
// trapping, Escape to close, and the backdrop. Reused by forms and confirmations.
//
// Props: open, onClose, title, children, wide (for bigger forms), className (extra styling)
export default function Modal({ open, onClose, title, children, wide = false, className = "" }) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={["modal", wide && "modal-wide", className].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // let the parent decide (it owns `open`)
        onClose();
      }}
    >
      {open && (
        <>
          <h2 id={titleId} className="modal-title">{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}
