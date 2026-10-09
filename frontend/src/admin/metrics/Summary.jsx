// "At a glance": four numbers for the range.
//
// Props: stats (from /api/stats/), or null while loading
export default function Summary({ stats }) {
  const busiest = stats?.by_day.reduce((best, d) => (d.rides > (best?.rides ?? 0) ? d : best), null);
  const perDay = stats?.weekdays ? stats.total / stats.weekdays : null;
  const place = stats?.top_place;
  const perRider = stats?.riders ? stats.total / stats.riders : null;
  const dash = "–";

  return (
    <div className="summary-tiles">
      <Tile label="Per weekday" value={perDay == null ? dash : perDay.toFixed(perDay < 10 ? 1 : 0)} note="rides on average" />
      <Tile
        label="Busiest day"
        value={busiest ? busiest.rides : dash}
        note={
          busiest
            ? new Date(`${busiest.date}T12:00:00Z`).toLocaleDateString("en-US", {
                timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
              })
            : "no rides yet"
        }
      />
      <Tile
        label="Most common place"
        value={place ? place.name : dash}
        note={place ? `${place.rides} ${place.rides === 1 ? "ride starts" : "rides start"} or end here` : "no rides yet"}
        text
      />
      <Tile
        label="Per rider"
        value={perRider == null ? dash : perRider.toFixed(1)}
        note={stats ? `rides on average, ${stats.riders} ${stats.riders === 1 ? "rider" : "riders"}` : ""}
      />
    </div>
  );
}

// `text`: the value is a name, not a number, so it's smaller and can wrap.
function Tile({ label, value, note, text = false }) {
  return (
    <div className="summary-tile">
      <span className="stat-label">{label}</span>
      <span className={`summary-value${text ? " text" : ""}`} title={text ? value : undefined}>{value}</span>
      <span className="summary-note">{note}</span>
    </div>
  );
}
