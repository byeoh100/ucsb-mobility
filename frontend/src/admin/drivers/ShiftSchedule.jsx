import { longTime, DAYS, gapsIn, toMinutes } from "../../lib/shifts.js";
import { GridLines, ShiftBlock, ShiftMenu, TimeRuler, timeLabel } from "./ShiftTimeline.jsx";
import { shiftKey } from "./useShiftEditing.js";

// Drivers → Shifts: everyone's week at once, to spot gaps in the schedule.
// Each weekday stacks a row per driver on shift that day (blocks show their
// name), and hatches the times nobody is on shift.
//
// Props:
//   drivers   [{ id, name, color, shifts }]
//   from, to  hours of operation, in minutes
//   editing   the Edit shifts switch
//   edit      useShiftEditing(...) for all drivers
export default function ShiftSchedule({ drivers, from, to, editing, edit }) {
  const byId = Object.fromEntries(drivers.map((d) => [d.id, d]));
  const { menu } = edit;

  return (
    <div className={`shift-schedule${editing ? " editing" : ""}`}>
      <div className="schedule-head">
        <span />
        <TimeRuler from={from} to={to} />
      </div>

      {DAYS.map((day, weekday) => {
        // A row for everyone with a shift that day, earliest first. Ordered by
        // their saved shifts, so rows don't jump around mid-drag.
        const first = (d) => Math.min(...d.shifts.filter((s) => s.weekday === weekday).map((s) => toMinutes(s.start)));
        const rows = drivers
          .filter((d) => edit.shown(d.id).some((s) => s.weekday === weekday))
          .sort((a, b) => first(a) - first(b) || a.name.localeCompare(b.name));
        const gaps = gapsIn(
          rows.flatMap((d) => edit.shown(d.id).filter((s) => s.weekday === weekday)),
          from,
          to
        );
        const gapText = gaps.map(([s, e]) => `${longTime(s)} to ${longTime(e)}`).join(", ");

        return (
          <div className="schedule-day" key={day}>
            <span className="shift-day schedule-day-label">{day}</span>
            <div className="schedule-rows">
              {rows.map((d) => (
                <div key={d.id} className="shift-lane" {...edit.laneHandlers({ weekday, driverId: d.id })}>
                  <GridLines from={from} to={to} />
                  {edit.shown(d.id).map((s, i) => {
                    if (s.weekday !== weekday) return null;
                    const selected = edit.selected === shiftKey(d.id, s);
                    return (
                      <ShiftBlock
                        key={i}
                        shift={s}
                        color={d.color}
                        from={from}
                        to={to}
                        editing={editing}
                        selected={selected}
                        label={d.name}
                        title={`${d.name}, ${timeLabel(s)}${editing ? ": drag to move, right-click to delete" : ""}`}
                        ariaLabel={`${d.name}, ${day} ${longTime(toMinutes(s.start))} to ${longTime(toMinutes(s.end))}`}
                        handlers={edit.blockHandlers(d.id, i)}
                        handleHandlers={(mode) => edit.handleHandlers(d.id, i, mode)}
                      >
                        {d.name}
                        {selected && <span className="shift-time"> {timeLabel(s)}</span>}
                      </ShiftBlock>
                    );
                  })}
                </div>
              ))}
              {rows.length === 0 && (
                <div className="shift-lane schedule-empty" {...edit.laneHandlers({ weekday })}>
                  <GridLines from={from} to={to} />
                  <span className="schedule-empty-text">No shifts</span>
                </div>
              )}
              {/* Times nobody is on shift, over every row of the day */}
              {gaps.map(([s, e]) => (
                <span
                  key={s}
                  className="shift-gap"
                  style={{ left: `${((s - from) / (to - from)) * 100}%`, width: `${((e - s) / (to - from)) * 100}%` }}
                  aria-hidden="true"
                />
              ))}
              {gaps.length > 0 && <span className="visually-hidden">{`${day}: nobody on shift ${gapText}.`}</span>}
            </div>
          </div>
        );
      })}

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
              Delete {byId[menu.driverId]?.name}'s shift
            </button>
          ) : (
            <AddMenu drivers={drivers} menu={menu} edit={edit} />
          )}
        </ShiftMenu>
      )}
    </div>
  );
}

// Add a shift for whoever's row was clicked, or anyone else. Drivers with no
// room at that time (already on shift) are greyed out.
function AddMenu({ drivers, menu, edit }) {
  const row = drivers.find((d) => d.id === menu.driverId);
  const others = drivers.filter((d) => d !== row);
  const item = (d, autoFocus) => {
    const room = edit.placeFor(d.id, menu.weekday, menu.minute);
    return (
      <button
        key={d.id}
        type="button"
        role="menuitem"
        autoFocus={autoFocus}
        disabled={!room}
        title={room ? undefined : "Already on shift then"}
        onClick={() => {
          edit.closeMenu();
          edit.addShift(d.id, menu.weekday, menu.minute);
        }}
      >
        <span className="swatch" style={{ background: d.color }} aria-hidden="true" />
        {d.name}
      </button>
    );
  };
  return (
    <>
      <p className="shift-menu-heading">Add shift for</p>
      {row && item(row, true)}
      {row && others.length > 0 && <hr className="shift-menu-divider" />}
      <div className="shift-menu-list">{others.map((d, i) => item(d, !row && i === 0))}</div>
    </>
  );
}
