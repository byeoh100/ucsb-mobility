import { Fragment, useEffect, useRef, useState } from "react";
import { DAYS, STEP, fromMinutes, longTime, roomFor, shortTime, snap, toMinutes } from "../../lib/shifts.js";

// A shift's identity for highlighting; the server re-sorts the list on save,
// so positions can change but day + start can't collide.
const keyOf = (s) => `${s.weekday}|${s.start}`;

const LONG_PRESS_MS = 550; // touch: press and hold opens the menu
const MOVE_SLOP = 6; // px a pointer can wander before it counts as a drag

// One driver's week: a white lane per weekday (solid line every hour, dotted
// every half hour) with the shifts as colored blocks showing their times.
//
// With `editing` on, shifts are edited right here:
//   drag a shift to move it, drag its ends to change start or end (snaps to
//   15 minutes; saved as soon as you let go)
//   click a shift to highlight it
//   right-click (or press and hold) a shift → Delete shift
//   right-click (or press and hold) empty space → Add shift (1 hour, in that
//   hour block)
//
// Props:
//   shifts    [{ weekday, start: "HH:MM", end: "HH:MM" }]
//   from, to  the hours shown, in minutes (the hours of operation)
//   editing   the page's Edit shifts switch
//   onCommit  (shifts) => void, with the whole new week, after each change
//   selected  key of the highlighted shift (one per page: the page owns it)
//   onSelect  (key | null) => void
export default function ShiftTimeline({ shifts, from, to, editing = false, onCommit, selected = null, onSelect }) {
  const [draft, setDraft] = useState(null); // shifts while a drag is in progress
  const setSelected = (key) => onSelect?.(key);
  const [menu, setMenu] = useState(null); // { x, y, index } or { x, y, weekday, minute }
  const drag = useRef(null);
  const shown = draft ?? shifts;
  const span = to - from;
  const pct = (minutes) => `${((minutes - from) / span) * 100}%`;

  useEffect(() => {
    if (!editing) setMenu(null);
  }, [editing]);

  // Close the menu on any outside click, scroll, or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  // ----- dragging ---------------------------------------------------------

  function startDrag(e, index, mode) {
    if (!editing || e.button > 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const lane = e.currentTarget.closest(".shift-lane").getBoundingClientRect();
    const s = shifts[index];
    drag.current = {
      index, mode, x: e.clientX, y: e.clientY, width: lane.width,
      s0: toMinutes(s.start), e0: toMinutes(s.end), moved: false,
      timer: e.pointerType === "touch" ? setTimeout(() => openMenu(e.clientX, e.clientY, { index }), LONG_PRESS_MS) : null,
    };
  }

  function moveDrag(e) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < MOVE_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      clearTimeout(d.timer);
      setSelected(keyOf(shifts[d.index]));
    }
    const delta = snap(((e.clientX - d.x) / d.width) * span);
    const [lo, hi] = roomFor(shifts, d.index, from, to);
    let s = d.s0;
    let en = d.e0;
    if (d.mode === "move") {
      s = Math.min(Math.max(d.s0 + delta, lo), hi - (d.e0 - d.s0));
      en = s + (d.e0 - d.s0);
    } else if (d.mode === "start") {
      s = Math.min(Math.max(d.s0 + delta, lo), d.e0 - STEP);
    } else {
      en = Math.max(Math.min(d.e0 + delta, hi), d.s0 + STEP);
    }
    setDraft(shifts.map((x, i) => (i === d.index ? { ...x, start: fromMinutes(s), end: fromMinutes(en) } : x)));
  }

  function endDrag() {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.timer);
    drag.current = null;
    if (!d.moved) {
      setSelected(keyOf(shifts[d.index])); // a click: highlight it
      return;
    }
    const changed = draft && JSON.stringify(draft) !== JSON.stringify(shifts);
    if (changed) {
      setSelected(keyOf(draft[d.index]));
      onCommit(draft);
    }
    setDraft(null);
  }

  // ----- menu (right-click, or press and hold on touch) -------------------

  function openMenu(x, y, target) {
    if (drag.current) {
      clearTimeout(drag.current.timer);
      drag.current = null;
    }
    setDraft(null);
    if (target.index != null) setSelected(keyOf(shifts[target.index]));
    setMenu({ x, y, ...target });
  }

  function laneMinute(e) {
    const box = e.currentTarget.getBoundingClientRect();
    return from + ((e.clientX - box.left) / box.width) * span;
  }

  // Empty space: long-press timer for touch (right-click is onContextMenu).
  const pressTimer = useRef(null);
  function lanePointerDown(e, weekday) {
    if (!editing || e.pointerType !== "touch") return;
    const { clientX: x, clientY: y } = e;
    const minute = laneMinute(e);
    pressTimer.current = setTimeout(() => openMenu(x, y, { weekday, minute }), LONG_PRESS_MS);
  }
  const cancelPress = () => clearTimeout(pressTimer.current);

  function addShift({ weekday, minute }) {
    // A 1-hour shift in the hour block that was clicked, moved over if
    // another shift is in the way.
    let start = Math.min(Math.max(Math.floor(minute / 60) * 60, from), to - 60);
    const probe = [...shifts, { weekday, start: fromMinutes(minute), end: fromMinutes(minute) }];
    const [lo, hi] = roomFor(probe, probe.length - 1, from, to);
    start = Math.max(start, lo);
    if (start + 60 > hi) start = Math.max(lo, hi - 60);
    const end = Math.min(start + 60, hi);
    if (end - start < STEP) return;
    const added = { weekday, start: fromMinutes(start), end: fromMinutes(end) };
    const next = [...shifts, added];
    setSelected(keyOf(added));
    onCommit(next);
  }

  function deleteShift(index) {
    setSelected(null);
    onCommit(shifts.filter((_, i) => i !== index));
  }

  // Keyboard: arrows move the highlighted shift 15 minutes; Delete removes it.
  function onKeyDown(e, index) {
    if (!editing) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteShift(index);
      return;
    }
    const step = { ArrowLeft: -STEP, ArrowRight: STEP }[e.key];
    if (!step) return;
    e.preventDefault();
    const s = toMinutes(shifts[index].start);
    const en = toMinutes(shifts[index].end);
    const [lo, hi] = roomFor(shifts, index, from, to);
    const ns = Math.min(Math.max(s + step, lo), hi - (en - s));
    if (ns === s) return;
    const moved = { ...shifts[index], start: fromMinutes(ns), end: fromMinutes(ns + en - s) };
    setSelected(keyOf(moved));
    onCommit(shifts.map((x, i) => (i === index ? moved : x)));
  }

  return (
    <div className={`shift-timeline${editing ? " editing" : ""}`}>
      {DAYS.map((day, weekday) => (
        <Fragment key={day}>
          <span className="shift-day">{day}</span>
          <div
            className="shift-lane"
            onContextMenu={
              editing
                ? (e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, { weekday, minute: laneMinute(e) });
                  }
                : undefined
            }
            onPointerDown={(e) => lanePointerDown(e, weekday)}
            onPointerUp={cancelPress}
            onPointerMove={cancelPress}
            onPointerCancel={cancelPress}
          >
            <GridLines from={from} to={to} />
            {shown.map((s, i) => {
              if (s.weekday !== weekday) return null;
              const start = toMinutes(s.start);
              const end = toMinutes(s.end);
              const label = `${shortTime(start)}–${shortTime(end)}`;
              return (
                <div
                  key={i}
                  className={`shift-block day-${weekday}${keyOf(s) === selected ? " selected" : ""}`}
                  style={{ left: pct(start), width: pct(from + end - start) }}
                  title={editing ? `${day} ${label}: drag to move, right-click to delete` : `${day} ${label}`}
                  tabIndex={editing ? 0 : undefined}
                  role={editing ? "slider" : undefined}
                  aria-label={editing ? `${day} shift ${longTime(start)} to ${longTime(end)}. Arrow keys move it; Delete removes it.` : undefined}
                  onPointerDown={(e) => startDrag(e, i, "move")}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onFocus={() => editing && setSelected(keyOf(s))}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onContextMenu={
                    editing
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openMenu(e.clientX, e.clientY, { index: i });
                        }
                      : undefined
                  }
                >
                  {editing && (
                    <span
                      className="shift-handle start"
                      onPointerDown={(e) => startDrag(e, i, "start")}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      aria-hidden="true"
                    />
                  )}
                  <span className="shift-label">{label}</span>
                  {editing && (
                    <span
                      className="shift-handle end"
                      onPointerDown={(e) => startDrag(e, i, "end")}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Fragment>
      ))}

      {menu && (
        <div
          className="shift-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {menu.index != null ? (
            <button
              type="button"
              role="menuitem"
              className="danger"
              autoFocus
              onClick={() => {
                setMenu(null);
                deleteShift(menu.index);
              }}
            >
              Delete shift
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              autoFocus
              onClick={() => {
                setMenu(null);
                addShift(menu);
              }}
            >
              Add shift
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// A solid line every hour and a dotted one every half hour, inside a lane.
export function GridLines({ from, to }) {
  const lines = [];
  for (let m = Math.ceil((from + 1) / 30) * 30; m < to; m += 30) lines.push(m);
  return lines.map((m) => (
    <span
      key={m}
      className={`grid-line${m % 60 ? " half" : ""}`}
      style={{ left: `${((m - from) / (to - from)) * 100}%` }}
      aria-hidden="true"
    />
  ));
}
