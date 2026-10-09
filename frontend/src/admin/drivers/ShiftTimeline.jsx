import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { DAYS, longTime, shortTime, textOn, toMinutes } from "../../lib/shifts.js";
import { shiftKey } from "./useShiftEditing.js";

// One driver's week, in the driver modal: a white lane per weekday with their
// shifts as blocks in the driver's color, showing their times.
//
// Props:
//   driver    { id, name, color }
//   from, to  the hours shown, in minutes (the hours of operation)
//   editing   the modal's Edit shifts switch
//   edit      useShiftEditing(...) for this driver
export default function ShiftTimeline({ driver, from, to, editing, edit }) {
  const shifts = edit.shown(driver.id);
  const { menu } = edit;
  return (
    <div className={`shift-timeline${editing ? " editing" : ""}`}>
      <span />
      <TimeRuler from={from} to={to} />
      {DAYS.map((day, weekday) => (
        <Fragment key={day}>
          <span className="shift-day">{day}</span>
          <div className="shift-lane" {...edit.laneHandlers({ weekday, driverId: driver.id })}>
            <GridLines from={from} to={to} />
            {shifts.map((s, i) =>
              s.weekday === weekday ? (
                <ShiftBlock
                  key={i}
                  shift={s}
                  color={driver.color}
                  from={from}
                  to={to}
                  editing={editing}
                  selected={edit.selected === shiftKey(driver.id, s)}
                  label={timeLabel(s)}
                  ariaLabel={`${day} shift ${longTime(toMinutes(s.start))} to ${longTime(toMinutes(s.end))}`}
                  handlers={edit.blockHandlers(driver.id, i)}
                  handleHandlers={(mode) => edit.handleHandlers(driver.id, i, mode)}
                />
              ) : null
            )}
          </div>
        </Fragment>
      ))}

      {menu && (
        <ShiftMenu x={menu.x} y={menu.y}>
          {menu.index != null ? (
            <button
              type="button"
              role="menuitem"
              className="danger"
              autoFocus
              onClick={() => {
                edit.closeMenu();
                edit.deleteShift(menu.driverId, menu.index);
              }}
            >
              Delete shift
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              autoFocus
              disabled={!edit.placeFor(driver.id, menu.weekday, menu.minute)}
              onClick={() => {
                edit.closeMenu();
                edit.addShift(driver.id, menu.weekday, menu.minute);
              }}
            >
              Add shift
            </button>
          )}
        </ShiftMenu>
      )}
    </div>
  );
}

export const timeLabel = (s) => `${shortTime(toMinutes(s.start))}–${shortTime(toMinutes(s.end))}`;

const pct = (minutes, from, to) => `${((minutes - from) / (to - from)) * 100}%`;

// A shift as a colored block. With editing on it can be dragged, and grows
// grab handles at both ends.
export function ShiftBlock({ shift, color, from, to, editing, selected, label, title, ariaLabel, handlers, handleHandlers, children }) {
  const start = toMinutes(shift.start);
  const end = toMinutes(shift.end);
  return (
    <div
      className={`shift-block${selected ? " selected" : ""}`}
      style={{ left: pct(start, from, to), width: pct(from + end - start, from, to), background: color, color: textOn(color) }}
      title={title ?? (editing ? `${label}: drag to move, right-click to delete` : label)}
      tabIndex={editing ? 0 : undefined}
      role={editing ? "slider" : undefined}
      aria-label={editing ? `${ariaLabel}. Arrow keys move it; Delete removes it.` : undefined}
      {...handlers}
    >
      {editing && <span className="shift-handle start" aria-hidden="true" {...handleHandlers("start")} />}
      <span className="shift-label">{children ?? label}</span>
      {editing && <span className="shift-handle end" aria-hidden="true" {...handleHandlers("end")} />}
    </div>
  );
}

// The right-click menu, at the pointer (moved over to stay on screen).
export function ShiftMenu({ x, y, children }) {
  const box = useRef(null);
  const [at, setAt] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const { width, height } = box.current.getBoundingClientRect();
    const margin = 8;
    setAt({
      left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    });
  }, [x, y]);
  return (
    <div ref={box} className="shift-menu" role="menu" style={at} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

// Hour labels with tick marks (tall every hour, short every half hour), lined
// up with the lanes below.
export function TimeRuler({ from, to }) {
  const ticks = [];
  for (let m = Math.ceil(from / 30) * 30; m <= to; m += 30) ticks.push(m);
  return (
    <div className="time-ruler" aria-hidden="true">
      {ticks.map((m) => (
        <span key={m} className={`ruler-tick${m % 60 ? " half" : ""}`} style={{ left: pct(m, from, to) }}>
          {m % 60 === 0 && (
            <span
              className={`ruler-label${m === from ? " first" : m === to ? " last" : ""}${(m - from) % 120 ? " odd" : ""}`}
            >
              {hourLabel(m, m === from)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

// 420 → "7 AM"; later hours drop the AM/PM except at noon ("12 PM").
function hourLabel(minutes, first) {
  const h = minutes / 60;
  const n = h % 12 || 12;
  if (first || h === 12) return `${n} ${h < 12 ? "AM" : "PM"}`;
  return String(n);
}

// A solid line every hour and a dotted one every half hour, inside a lane.
export function GridLines({ from, to }) {
  const lines = [];
  for (let m = Math.ceil((from + 1) / 30) * 30; m < to; m += 30) lines.push(m);
  return lines.map((m) => (
    <span key={m} className={`grid-line${m % 60 ? " half" : ""}`} style={{ left: pct(m, from, to) }} aria-hidden="true" />
  ));
}
