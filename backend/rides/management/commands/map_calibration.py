"""python manage.py map_calibration

Shows how well the campus map landmarks fit together. A point that's far off
compared to the others probably has a wrong pixel position or GPS value.
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
