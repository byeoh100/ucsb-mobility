"""python manage.py map_calibration

Shows how well the campus map landmarks fit together. A point that's far off
compared to the others probably has a wrong pixel position or GPS value.

Driver locations are GPS; the map is a picture. rides/map_calibration.json
lists landmarks as pixel position on the image <-> GPS, and rides/geo.py fits
the map to them. It starts with 3 landmarks (about 5-15 m each).

To improve it, add points at features you can pinpoint on the image, like
path intersections or building corners. Spread them across the map,
especially the east and south edges:

  1. Find the pixel position on frontend/src/assets/campus-map.jpg (most image
     viewers show cursor coordinates).
  2. Right-click the same spot in Google Maps to copy its latitude/longitude.
  3. Add {"name", "x", "y", "lat", "lng"} to "points" in map_calibration.json,
     then run this command. Restart the server to use the new fit.

The real-world test is walking around campus with the driver view open on a
ride: the blue "You" dot should follow you. (Phones only share location over
HTTPS, so use the deployed site or a tunnel, not http://192.168.x.x.)
"""

from django.core.management.base import BaseCommand

from rides.geo import calibration


class Command(BaseCommand):
    help = "Check how well the map calibration landmarks fit."

    def handle(self, *args, **options):
        calibration.cache_clear()
        c = calibration()
        self.stdout.write(f"Scale: {c['pixels_per_metre']:.3f} px per metre  |  rotation: {c['rotation_degrees']:.1f}°")
        self.stdout.write("Landmark fit (lower is better; under ~15 m is good):")
        for r in sorted(c["residuals"], key=lambda r: -r["error_m"]):
            flag = "  <-- check this point" if r["error_m"] > 25 else ""
            self.stdout.write(f"  {r['name']:42s} {r['error_m']:5.1f} m  ({r['error_px']:.1f} px){flag}")
