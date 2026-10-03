// GPS → position on the campus map image, using coefficients fitted on the
// server (rides/geo.py) and sent in the session config.
export function toMapPoint({ lat, lng }, calibration) {
  if (!calibration) return null;
  const { cx, cy } = calibration;
  const x = cx[0] + cx[1] * lng + cx[2] * lat;
  const y = cy[0] + cy[1] * lng + cy[2] * lat;
  return { x, y, onMap: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
}

// "just now", "40 sec ago", "3 min ago"
export function ageLabel(seconds) {
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} sec ago`;
  return `${Math.round(seconds / 60)} min ago`;
}
