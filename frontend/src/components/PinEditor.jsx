import { useRef, useState } from "react";
import mapUrl from "../assets/campus-map.jpg";
import { Pin } from "./CampusMap.jsx";

const clamp = (v) => Math.min(1, Math.max(0, v));
const LABELS = { pickup: "Pickup", dropoff: "Drop-off" };

// Lets a rider place and drag their pickup/drop-off pins on the campus map.
// Tap the map to put the selected pin there; drag a pin to move it.
// Every change is saved through onSave({ pickup, dropoff }).
//
// Props: pickup, dropoff ({x, y} or null), onSave(pins) => Promise, onDone()
export default function PinEditor({ pickup, dropoff, onSave, onDone }) {
  const [pins, setPins] = useState({ pickup, dropoff });
  const [selected, setSelected] = useState(pickup && !dropoff ? "dropoff" : "pickup");
  const [dragging, setDragging] = useState(null);
  const [saveState, setSaveState] = useState("");
  const frame = useRef(null);
  const latest = useRef(pins);
  latest.current = pins;

  function pointFrom(e) {
    const r = frame.current.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  }

  async function save(next) {
    setSaveState("Saving…");
    try {
      await onSave(next);
      setSaveState("Saved");
    } catch (err) {
      setSaveState(err.message);
    }
  }

  function onPointerDown(e) {
    // Grab an existing pin, or drop the selected one where they tapped.
    const kind = e.target.closest("[data-kind]")?.dataset.kind ?? selected;
    e.preventDefault();
    frame.current.setPointerCapture(e.pointerId);
    setDragging(kind);
    setSelected(kind);
    setPins((p) => ({ ...p, [kind]: pointFrom(e) }));
  }

  function onPointerMove(e) {
    if (!dragging) return;
    setPins((p) => ({ ...p, [dragging]: pointFrom(e) }));
  }

  function onPointerUp() {
    if (!dragging) return;
    const placed = dragging;
    setDragging(null);
    save(latest.current);
    // After the first pickup, move straight on to the drop-off.
    if (placed === "pickup" && !latest.current.dropoff) setSelected("dropoff");
  }

  function clear() {
    const next = { pickup: null, dropoff: null };
    setPins(next);
    setSelected("pickup");
    save(next);
  }

  return (
    <div className="pin-editor stack">
      <div className="segmented" role="radiogroup" aria-label="Which pin to place">
        {["pickup", "dropoff"].map((kind) => (
          <button
            key={kind}
            role="radio"
            aria-checked={selected === kind}
            aria-selected={selected === kind}
            onClick={() => setSelected(kind)}
          >
            <span className={`legend legend-${kind}`}>{LABELS[kind]}</span>
            {pins[kind] && " ✓"}
          </button>
        ))}
      </div>
      <p className="hint">
        Tap the map where you'll be for your <strong>{LABELS[selected].toLowerCase()}</strong>. Drag a pin to move it.
      </p>

      <div
        ref={frame}
        className={`campus-map-frame editing${dragging ? " dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img src={mapUrl} alt="Map of the UCSB campus. Tap to place a pin." draggable={false} />
        {["pickup", "dropoff"].map(
          (kind) =>
            pins[kind] && (
              <Pin key={kind} point={pins[kind]} kind={kind} label={LABELS[kind]} data-kind={kind} className="draggable" />
            )
        )}
      </div>

      <div className="pin-editor-actions">
        <span className="muted small" role="status">{saveState}</span>
        <span>
          {(pins.pickup || pins.dropoff) && (
            <button className="button-quiet" onClick={clear}>Clear pins</button>
          )}{" "}
          <button className="button" onClick={onDone}>Done</button>
        </span>
      </div>
    </div>
  );
}
