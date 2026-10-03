"""Placing GPS positions on the campus map image.

The map is treated as a flat picture of campus that may be scaled, slightly
rotated and shifted relative to true north (a "similarity" transform). Those
four numbers are fitted, by least squares, to the landmark pairs in
map_calibration.json. Over an area as small as campus, that's accurate to
roughly the precision of the landmarks themselves.

The result is published as six linear coefficients so the frontend can
convert the driver's own GPS to a "You are here" dot with the same math:

    x = cx[0] + cx[1] * lng + cx[2] * lat      (fraction of image width)
    y = cy[0] + cy[1] * lng + cy[2] * lat      (fraction of image height)
"""

import json
import math
from functools import lru_cache
from pathlib import Path

CALIBRATION_FILE = Path(__file__).with_name("map_calibration.json")
METRES_PER_DEG_LAT = 111_320


def _solve(matrix, vector):
    """Solve a small linear system by Gaussian elimination (no numpy needed)."""
    n = len(vector)
    m = [row[:] + [vector[i]] for i, row in enumerate(matrix)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[pivot] = m[pivot], m[col]
        for r in range(n):
            if r != col:
                f = m[r][col] / m[col][col]
                m[r] = [a - f * b for a, b in zip(m[r], m[col])]
    return [m[i][n] / m[i][i] for i in range(n)]


@lru_cache(maxsize=1)
def calibration():
    """Fit the transform from the landmarks file. Cached; restart to reload."""
    data = json.loads(CALIBRATION_FILE.read_text())
    width, height = data["image"]["width"], data["image"]["height"]
    points = data["points"]
    if len(points) < 2:
        raise ValueError("map_calibration.json needs at least 2 points (3+ recommended).")

    # Work in metres east/north of the landmarks' centre, so the numbers are well behaved.
    lat0 = sum(p["lat"] for p in points) / len(points)
    lng0 = sum(p["lng"] for p in points) / len(points)
    m_lng = METRES_PER_DEG_LAT * math.cos(math.radians(lat0))

    def east_north(lat, lng):
        return (lng - lng0) * m_lng, (lat - lat0) * METRES_PER_DEG_LAT

    # Pixel = scale·rotation·(E, N) + shift, with image y pointing down:
    #   px =  a·E − b·N + tx
    #   py = −b·E − a·N + ty
    rows, values = [], []
    for p in points:
        e, n = east_north(p["lat"], p["lng"])
        rows += [[e, -n, 1, 0], [-n, -e, 0, 1]]
        values += [p["x"], p["y"]]
    normal = [[sum(r[i] * r[j] for r in rows) for j in range(4)] for i in range(4)]
    rhs = [sum(r[i] * v for r, v in zip(rows, values)) for i in range(4)]
    a, b, tx, ty = _solve(normal, rhs)

    # Expand into coefficients on raw lat/lng, as fractions of the image.
    cx = [
        (tx - a * lng0 * m_lng + b * lat0 * METRES_PER_DEG_LAT) / width,
        a * m_lng / width,
        -b * METRES_PER_DEG_LAT / width,
    ]
    cy = [
        (ty + b * lng0 * m_lng + a * lat0 * METRES_PER_DEG_LAT) / height,
        -b * m_lng / height,
        -a * METRES_PER_DEG_LAT / height,
    ]
    scale = math.hypot(a, b)  # pixels per metre
    residuals = []
    for p in points:
        x, y = _apply(cx, cy, p["lat"], p["lng"])
        err_px = math.hypot(x * width - p["x"], y * height - p["y"])
        residuals.append({"name": p["name"], "error_px": err_px, "error_m": err_px / scale})
    return {
        "cx": cx,
        "cy": cy,
        "pixels_per_metre": scale,
        "rotation_degrees": math.degrees(math.atan2(b, a)),
        "residuals": residuals,
    }


def _apply(cx, cy, lat, lng):
    return cx[0] + cx[1] * lng + cx[2] * lat, cy[0] + cy[1] * lng + cy[2] * lat


def to_map(lat, lng):
    """GPS → {"x", "y", "on_map"}; x/y are fractions of the image."""
    c = calibration()
    x, y = _apply(c["cx"], c["cy"], lat, lng)
    return {"x": x, "y": y, "on_map": 0 <= x <= 1 and 0 <= y <= 1}


def frontend_calibration():
    c = calibration()
    return {"cx": c["cx"], "cy": c["cy"]}
