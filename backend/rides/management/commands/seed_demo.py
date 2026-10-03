"""python manage.py seed_demo

Fills the database with demo drivers and a day of rides, for trying the UI
before the ride form exists. Development only (refuses when DEBUG is off).

    python manage.py seed_demo                 rides for today
    python manage.py seed_demo --date 2026-10-06
    python manage.py seed_demo --clear         delete all rides first
"""

import random
from datetime import date, datetime, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from accounts.models import Driver
from rides.models import Ride

# Approximate pins; real ones get dropped on the map by dispatch.
PLACES = [
    ("Davidson Library", 34.41340, -119.84560),
    ("Campbell Hall", 34.41660, -119.84480),
    ("Phelps Hall", 34.41610, -119.84440),
    ("Engineering II", 34.41410, -119.84120),
    ("UCen", 34.41160, -119.84860),
    ("Student Resource Building", 34.41230, -119.84780),
    ("Rec Cen", 34.41850, -119.85070),
    ("Psychology Building", 34.41210, -119.84500),
    ("Music Building", 34.41290, -119.84960),
    ("Manzanita Village", 34.40960, -119.85360),
]

DRIVERS = [
    ("dana@umail.ucsb.edu", "Dana Ortiz", "8055550123", "#1a73e8"),
    ("jamal@umail.ucsb.edu", "Jamal Wright", "8055550144", "#188038"),
    ("lena@umail.ucsb.edu", "Lena Park", "8055550456", "#e8710a"),
    ("maya@umail.ucsb.edu", "Maya Chen", "8055550199", "#9334e6"),
    ("sam@umail.ucsb.edu", "Sam Rivera", "8055550777", "#d93025"),
]

FIRST = ["Alex", "Jordan", "Taylor", "Morgan", "Riley", "Casey", "Avery", "Quinn", "Jamie", "Drew",
         "Priya", "Kenji", "Sofia", "Mateo", "Hana", "Omar", "Lucia", "Ethan", "Zara", "Noah"]
LAST = ["Nguyen", "Patel", "Garcia", "Kim", "Johnson", "Lopez", "Brown", "Singh", "Martinez", "Lee"]


class Command(BaseCommand):
    help = "Create demo drivers and a day of rides (development only)."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="YYYY-MM-DD (default: today)")
        parser.add_argument("--rides", type=int, default=24)
        parser.add_argument("--clear", action="store_true", help="Delete all rides first")

    def handle(self, *args, **opts):
        if not settings.DEBUG:
            raise CommandError("seed_demo only runs with DJANGO_DEBUG on.")
        day = date.fromisoformat(opts["date"]) if opts["date"] else timezone.localdate()
        rng = random.Random(day.toordinal())  # same day → same demo data

        if opts["clear"]:
            Ride.objects.all().delete()

        drivers = []
        for email, name, phone, color in DRIVERS:
            driver = Driver.objects.filter(email=email).first()
            if driver is None and not Driver.objects.filter(color=color).exists():
                driver = Driver.objects.create(email=email, name=name, phone=phone, color=color)
            if driver:
                drivers.append(driver)

        now = timezone.now()
        tz = timezone.get_current_timezone()
        created = 0
        for i in range(opts["rides"]):
            minutes = rng.randrange(0, 14 * 60, 10)  # 8:00 AM to 9:50 PM
            pickup_time = datetime.combine(day, datetime.min.time(), tzinfo=tz) + timedelta(hours=8, minutes=minutes)
            start, end = rng.sample(PLACES, 2)
            first, last = rng.choice(FIRST), rng.choice(LAST)
            driver = rng.choice(drivers) if drivers and rng.random() > 0.15 else None  # ~15% unassigned

            ride = Ride(
                rider_name=f"{first} {last}",
                rider_phone=f"805555{1000 + i:04d}",
                rider_email=f"{first.lower()}{last.lower()}@umail.ucsb.edu",
                pickup_time=pickup_time,
                pickup_name=start[0], pickup_lat=start[1], pickup_lng=start[2],
                dropoff_name=end[0], dropoff_lat=end[1], dropoff_lng=end[2],
                driver=driver,
            )
            # Make rides around "now" look in progress.
            if driver and timedelta(minutes=-15) < pickup_time - now < timedelta(minutes=15):
                ride.started_at = now - timedelta(minutes=2)
                ride.rider_confirmed_at = now - timedelta(minutes=1) if rng.random() > 0.4 else None
            ride.save()
            created += 1

        self.stdout.write(self.style.SUCCESS(f"Created {created} rides on {day} with {len(drivers)} drivers."))
