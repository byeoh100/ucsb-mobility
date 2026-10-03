import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { archiveApi } from "../../api.js";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { formatDayLabel } from "../../lib/time.js";
import RideTable from "../rides/RideTable.jsx";

// Admin → Archive: past days' rides, read-only. A list of archived days on
// the left; the selected day's rides on the right. The day is in the URL.
export default function ArchivePage() {
  const { config } = useAuth();
  const [params, setParams] = useSearchParams();

  const [days, setDays] = useState(null); // null = loading
  const [retention, setRetention] = useState(config.archive_retention_days);
  const [rides, setRides] = useState(null);
  const [error, setError] = useState("");
  const [sort, setSort] = useState({ key: "time", dir: "asc" });

  const selected = params.get("date") ?? days?.[0]?.date ?? null;
  const selectedDay = days?.find((d) => d.date === selected);

  const loadDays = useCallback(async () => {
    try {
      const body = await archiveApi.days();
      setDays(body.days);
      setRetention(body.retention_days);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    loadDays();
  }, [loadDays]);

  // Load the selected day's rides (only if it's actually in the archive).
  useEffect(() => {
    if (!selectedDay) {
      setRides(null);
      return;
    }
    let cancelled = false;
    setRides(null);
    archiveApi
      .list(selectedDay.date)
      .then((list) => !cancelled && setRides(list))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [selectedDay?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="stack">
      <div className="page-header">
        <h1>Archive</h1>
        <p className="muted archive-note">
          Each day's rides move here at {formatHour(config.archive_hour)} the next morning and are kept for {retention}{" "}
          days.
        </p>
      </div>

      {error && (
        <p className="error" role="alert">
          {error} <button className="button-quiet" onClick={loadDays}>Try again</button>
        </p>
      )}
      {days === null && !error && <p className="muted">Loading archive…</p>}

      {days && days.length === 0 && (
        <div className="empty-state">
          <p>Nothing archived yet.</p>
        </div>
      )}

      {days && days.length > 0 && (
        <div className="archive-layout">
          <nav className="archive-days" aria-label="Archived days">
            {days.map((d) => (
              <button
                key={d.date}
                className={`archive-day${d.date === selected ? " selected" : ""}`}
                aria-current={d.date === selected ? "date" : undefined}
                onClick={() => setParams({ date: d.date })}
              >
                <span>{formatDayLabel(d.date)}</span>
                <span className="archive-day-count">{d.count}</span>
              </button>
            ))}
          </nav>

          <div className="stack archive-detail">
            {!selectedDay && (
              <div className="empty-state">
                <p>Nothing archived for {selected ? formatDayLabel(selected) : "that day"}.</p>
                <p className="muted">It may not be archived yet, or it's past the {retention}-day limit.</p>
              </div>
            )}
            {selectedDay && (
              <>
                <h2 className="archive-heading">
                  {formatDayLabel(selectedDay.date)} <span className="count">{selectedDay.count}</span>
                </h2>
                {rides === null ? (
                  <p className="muted">Loading rides…</p>
                ) : (
                  <RideTable rides={rides} timeZone={config.time_zone} sort={sort} onSort={setSort} readOnly />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function formatHour(hour) {
  const h = hour % 12 || 12;
  return `${h}:00 ${hour < 12 ? "AM" : "PM"}`;
}
