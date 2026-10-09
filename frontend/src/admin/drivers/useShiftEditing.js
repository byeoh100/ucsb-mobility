import { useEffect, useRef, useState } from "react";
import { driversApi } from "../../api.js";
import { STEP, fromMinutes, placeNewShift, roomFor, snap, toMinutes } from "../../lib/shifts.js";

// The order the server keeps a week in. Sorting before showing a change means
// list positions (which the menu and keyboard use) don't shift when the save
// comes back.
const byDayThenStart = (a, b) => a.weekday - b.weekday || toMinutes(a.start) - toMinutes(b.start);

// Editing shifts in place, shared by the driver modal (one driver's week) and
// the Shifts tab (everyone's week). Shifts are always edited per driver: each
// change sends that driver's whole week to the server.
//
//   drag a shift to move it, drag its ends to change start or end (snaps to
//   15 minutes; saved as soon as you let go)
//   click a shift to highlight it; click anywhere else to let go of it
//   right-click (or press and hold) a shift → Delete shift
//   right-click (or press and hold) empty space → Add shift
//   arrow keys move the highlighted shift 15 minutes; Delete removes it

const LONG_PRESS_MS = 550; // touch: press and hold opens the menu
const MOVE_SLOP = 6; // px a pointer can wander before it counts as a drag

// A shift's identity for highlighting; the server re-sorts the list on save,
// so positions can change but driver + day + start can't collide.
export const shiftKey = (driverId, s) => `${driverId}|${s.weekday}|${s.start}`;

// Saving: shows each driver's new week right away, while the save is on its way.
//
//   onSaved(driver)  with the driver as the server returned it
// Returns { weekOf(driver), save(driverId, shifts), status, error }
export function useShiftSaver(onSaved) {
  const [pending, setPending] = useState({}); // driverId → shifts being saved
  const [status, setStatus] = useState(""); // "", "saving", "saved"
  const [error, setError] = useState("");
  const latest = useRef({}); // driverId → number of their newest save
  const applied = useRef({}); // driverId → number of the newest save the server confirmed
  const inFlight = useRef(0);
  const lastOk = useRef(true); // how the most recently finished save went

  async function save(driverId, shifts) {
    const mine = (latest.current[driverId] ?? 0) + 1;
    latest.current[driverId] = mine;
    inFlight.current += 1;
    setPending((p) => ({ ...p, [driverId]: [...shifts].sort(byDayThenStart) }));
    setStatus("saving");
    setError("");
    try {
      const saved = await driversApi.shifts(driverId, shifts);
      // Keep any confirmed week newer than what's shown, even if a later save
      // is still on its way: if that one fails, this is what the server has.
      if (mine > (applied.current[driverId] ?? 0)) {
        applied.current[driverId] = mine;
        onSaved(saved);
      }
      lastOk.current = true;
      setError("");
    } catch (err) {
      lastOk.current = false;
      const detail = err.data?.shifts;
      setError((Array.isArray(detail) && (detail[0]?.non_field_errors?.[0] || detail[0])) || err.message);
    } finally {
      inFlight.current -= 1;
      // Only the newest save for this driver decides what's shown; on failure
      // this puts their last confirmed week back.
      if (latest.current[driverId] === mine) setPending(({ [driverId]: _, ...rest }) => rest);
      if (inFlight.current === 0) setStatus(lastOk.current ? "saved" : "");
    }
  }

  return { weekOf: (driver) => pending[driver.id] ?? driver.shifts, save, status, error };
}

// The pointer, menu and keyboard handling.
//
//   from, to   hours of operation, in minutes
//   editing    the Edit shifts switch
//   weekOf     (driverId) => that driver's shifts (as currently shown)
//   save       (driverId, shifts) => void
export function useShiftEditing({ from, to, editing, weekOf, save }) {
  const [draft, setDraft] = useState(null); // { driverId, shifts } while a drag is in progress
  const [menu, setMenu] = useState(null); // { x, y, driverId, index } or { x, y, weekday, minute, driverId? }
  const [selected, setSelected] = useState(null);
  const drag = useRef(null);
  const pressTimer = useRef(null);
  const pressStart = useRef(null);
  const span = to - from;

  const shown = (driverId) => (draft?.driverId === driverId ? draft.shifts : weekOf(driverId));

  // Turning editing off closes the menu and lets go of the highlighted shift.
  useEffect(() => {
    if (!editing) {
      setMenu(null);
      setSelected(null);
    }
  }, [editing]);

  // Clicking anywhere that isn't a shift (or the menu) lets go of the highlight.
  useEffect(() => {
    if (!editing) return;
    const clear = (e) => !e.target.closest?.(".shift-block, .shift-menu") && setSelected(null);
    document.addEventListener("pointerdown", clear);
    return () => document.removeEventListener("pointerdown", clear);
  }, [editing]);

  // Close the menu on any outside click, scroll, or Escape.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Escape closes just the menu, not the driver modal it's inside.
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menu]);

  // ----- dragging ---------------------------------------------------------

  function startDrag(e, driverId, index, mode) {
    if (!editing || e.button > 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const lane = e.currentTarget.closest(".shift-lane").getBoundingClientRect();
    const shifts = weekOf(driverId);
    const s = shifts[index];
    drag.current = {
      driverId, index, mode, shifts, x: e.clientX, y: e.clientY, width: lane.width,
      s0: toMinutes(s.start), e0: toMinutes(s.end), moved: false, draft: null,
      timer:
        e.pointerType === "touch"
          ? setTimeout(() => openMenu(e.clientX, e.clientY, { driverId, index }), LONG_PRESS_MS)
          : null,
    };
  }

  function moveDrag(e) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < MOVE_SLOP) return;
    if (!d.moved) {
      d.moved = true;
      clearTimeout(d.timer);
      setSelected(shiftKey(d.driverId, d.shifts[d.index]));
    }
    const delta = snap(((e.clientX - d.x) / d.width) * span);
    const [lo, hi] = roomFor(d.shifts, d.index, from, to);
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
    d.draft = d.shifts.map((x, i) => (i === d.index ? { ...x, start: fromMinutes(s), end: fromMinutes(en) } : x));
    setDraft({ driverId: d.driverId, shifts: d.draft });
    setSelected(shiftKey(d.driverId, d.draft[d.index])); // stays highlighted as it moves
  }

  function endDrag() {
    const d = drag.current;
    if (!d) return;
    clearTimeout(d.timer);
    drag.current = null;
    if (!d.moved) {
      setSelected(shiftKey(d.driverId, d.shifts[d.index])); // a click: highlight it
      return;
    }
    if (d.draft && JSON.stringify(d.draft) !== JSON.stringify(d.shifts)) {
      setSelected(shiftKey(d.driverId, d.draft[d.index]));
      save(d.driverId, d.draft);
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
    if (target.index != null) setSelected(shiftKey(target.driverId, weekOf(target.driverId)[target.index]));
    setMenu({ x, y, ...target });
  }

  // The minute of the day under the pointer, in a lane.
  function minuteAt(e) {
    const box = e.currentTarget.getBoundingClientRect();
    return from + ((e.clientX - box.left) / box.width) * span;
  }

  // Handlers for a lane's empty space. `target` = { weekday, driverId? }
  function laneHandlers(target) {
    if (!editing) return {};
    const cancel = () => clearTimeout(pressTimer.current);
    return {
      onContextMenu: (e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY, { ...target, minute: minuteAt(e) });
      },
      onPointerDown: (e) => {
        if (e.pointerType !== "touch") return;
        const { clientX: x, clientY: y } = e;
        const minute = minuteAt(e);
        pressStart.current = { x, y };
        pressTimer.current = setTimeout(() => openMenu(x, y, { ...target, minute }), LONG_PRESS_MS);
      },
      onPointerUp: cancel,
      // A finger always wobbles a little; only a real move cancels the press.
      onPointerMove: (e) => {
        const p = pressStart.current;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= MOVE_SLOP) cancel();
      },
      onPointerCancel: cancel,
    };
  }

  // Handlers for a shift block, and for its two resize handles.
  function blockHandlers(driverId, index) {
    return {
      onPointerDown: (e) => startDrag(e, driverId, index, "move"),
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onFocus: () => editing && setSelected(shiftKey(driverId, weekOf(driverId)[index])),
      onKeyDown: (e) => onKeyDown(e, driverId, index),
      onContextMenu: editing
        ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMenu(e.clientX, e.clientY, { driverId, index });
          }
        : undefined,
    };
  }
  function handleHandlers(driverId, index, mode) {
    return {
      onPointerDown: (e) => startDrag(e, driverId, index, mode),
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
    };
  }

  // ----- changes ----------------------------------------------------------

  // Where a new shift would go for this driver (null = no room there).
  const placeFor = (driverId, weekday, minute) => placeNewShift(weekOf(driverId), weekday, minute, from, to);

  function addShift(driverId, weekday, minute) {
    const added = placeFor(driverId, weekday, minute);
    if (!added) return;
    setSelected(shiftKey(driverId, added));
    save(driverId, [...weekOf(driverId), added]);
  }

  function deleteShift(driverId, index) {
    setSelected(null);
    save(driverId, weekOf(driverId).filter((_, i) => i !== index));
  }

  function onKeyDown(e, driverId, index) {
    if (!editing) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      deleteShift(driverId, index);
      return;
    }
    const step = { ArrowLeft: -STEP, ArrowRight: STEP }[e.key];
    if (!step) return;
    e.preventDefault();
    const shifts = weekOf(driverId);
    const s = toMinutes(shifts[index].start);
    const en = toMinutes(shifts[index].end);
    const [lo, hi] = roomFor(shifts, index, from, to);
    const ns = Math.min(Math.max(s + step, lo), hi - (en - s));
    if (ns === s) return;
    const moved = { ...shifts[index], start: fromMinutes(ns), end: fromMinutes(ns + en - s) };
    setSelected(shiftKey(driverId, moved));
    save(driverId, shifts.map((x, i) => (i === index ? moved : x)));
  }

  return {
    shown, selected, menu, closeMenu: () => setMenu(null),
    laneHandlers, blockHandlers, handleHandlers, placeFor, addShift, deleteShift,
  };
}
