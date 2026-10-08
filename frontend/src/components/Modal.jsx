import { useEffect, useId, useRef } from "react";

// Centered dialog built on the native <dialog> element, which handles focus
// trapping, Escape to close, and the backdrop. Reused by forms and confirmations.
//
// Props: open, onClose, title, children, wide (for bigger forms), className (extra styling),
//        closeOnBackdrop (a tap outside closes it; for quick checks, not forms
//        where a stray tap would lose what was typed)
export default function Modal({ open, onClose, title, children, wide = false, className = "", closeOnBackdrop = false }) {
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
      onClick={
        closeOnBackdrop
          ? (e) => {
              // A tap on the backdrop lands on the <dialog> itself, outside its box.
              if (e.target !== e.currentTarget) return;
              const box = e.currentTarget.getBoundingClientRect();
              const inside =
                e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
              if (!inside) onClose();
            }
          : undefined
      }
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
