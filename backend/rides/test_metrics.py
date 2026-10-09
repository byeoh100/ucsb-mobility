from datetime import date, timedelta

from django.test import TestCase, override_settings

from accounts.models import Driver

from .archive import purge_expired
from .models import Ride
from .test_archive import ArchiveTests, at, local

THU = date(2026, 10, 15)  # Monday of that week is Oct 12


@override_settings(ARCHIVE_RETENTION_DAYS=30)
class RideCountTests(TestCase):
    setUp = ArchiveTests.setUp

    def ride(self, day, hour=10, minute=0, driver=None, marked=False):
        return Ride.objects.create(
            rider_name="R", rider_phone="8055550000", rider_email="r@ucsb.edu",
            pickup_time=local(day, hour, minute), pickup_name="A", dropoff_name="B", driver=driver or self.driver,
            started_at=local(day, hour) if marked else None, completed_at=local(day, hour) if marked else None,
        )

    def counts(self):
        return self.client.get("/api/drivers/").json()[0]["ride_counts"]

    def test_week_and_total(self):
        self.ride(THU - timedelta(days=3))  # Monday: this week (a no-show still counts)
        self.ride(THU, 10)  # over an hour ago: completed
        self.ride(THU, 11, marked=True)  # marked complete just now
        self.ride(THU, 11, 30)  # 30 min ago, never closed: not yet
        self.ride(THU, 14)  # later today: not yet
        self.ride(THU - timedelta(days=4))  # last Sunday: last week
        Ride.objects.create(  # unassigned: nobody's
            rider_name="R", rider_phone="8055550000", pickup_time=local(THU, 9), pickup_name="A", dropoff_name="B",
        )
        with at(THU, 12):
            self.assertEqual(self.counts(), {"week": 3, "total": 4})

    def test_total_survives_the_purge(self):
        for _ in range(2):
            self.ride(THU - timedelta(days=40))
        self.ride(THU - timedelta(days=40), driver=Driver.objects.create(email="o@ucsb.edu", name="Zed", color="#d93025"))
        self.ride(THU)
        with at(THU, 12):
            self.assertEqual(purge_expired(), 3)
            self.assertEqual(self.counts(), {"week": 1, "total": 3})
            purge_expired()  # running again doesn't count anything twice
            self.assertEqual(self.counts()["total"], 3)
        self.assertEqual(Driver.objects.get(name="Zed").purged_rides, 1)

    def test_shift_save_returns_counts(self):
        self.ride(THU)
        with at(THU, 12):
            r = self.client.put(f"/api/drivers/{self.driver.id}/shifts/", {"shifts": []}, content_type="application/json")
        self.assertEqual(r.json()["ride_counts"], {"week": 1, "total": 1})


@override_settings(ARCHIVE_RETENTION_DAYS=90)
class StatsApiTests(TestCase):
    setUp = ArchiveTests.setUp
    ride = RideCountTests.ride

    def stats(self, first, last):
        return self.client.get(f"/api/stats/?from={first}&to={last}")

    def test_rides_per_driver_in_range(self):
        zed = Driver.objects.create(email="z@ucsb.edu", name="Zed", color="#d93025")
        for _ in range(3):
            self.ride(THU - timedelta(days=2))
        self.ride(THU - timedelta(days=6), driver=zed)
        self.ride(THU - timedelta(days=7), driver=zed)  # outside a 7-day window
        self.ride(THU, 14)  # later today: not completed yet
        self.ride(THU, 8, 30, marked=True)  # this morning, started and completed
        with at(THU, 12):
            r = self.stats(THU - timedelta(days=6), THU + timedelta(days=1)).json()
        self.assertEqual(r["total"], 5)
        self.assertEqual([(d["name"], d["rides"]) for d in r["drivers"]], [("Dana", 4), ("Zed", 1)])
        self.assertEqual(r["drivers"][0]["color"], "#1a73e8")
        self.assertEqual(len(r["by_day"]), 8)  # every date, zeros included
        self.assertEqual(r["by_day"][4], {"date": "2026-10-13", "rides": 3})
        self.assertEqual(r["by_day"][0], {"date": "2026-10-09", "rides": 1})
        self.assertEqual(r["by_hour"][0], {"hour": 7, "rides": 0})
        self.assertEqual([h["hour"] for h in r["by_hour"]][-1], 18)  # through 7 PM closing
        self.assertEqual(r["by_hour"][1], {"hour": 8, "rides": 1})
        self.assertEqual(r["by_hour"][3], {"hour": 10, "rides": 4})
        self.assertEqual(r["top_place"], {"name": "A", "rides": 5})  # A and B tie (every ride): alphabetical
        self.assertEqual(r["riders"], 1)
        self.assertEqual(r["weekdays"], 5)  # Fri Oct 9 to Thu Oct 15, not Friday the 16th

    def test_bad_dates(self):
        self.assertEqual(self.stats("nope", THU).status_code, 400)
        self.assertEqual(self.stats(THU, THU - timedelta(days=1)).status_code, 400)
        self.assertEqual(self.stats(THU - timedelta(days=400), THU).status_code, 400)

    def test_dispatch_only(self):
        from django.contrib.auth import get_user_model

        self.client.force_login(get_user_model().objects.create(username="d@ucsb.edu", email="d@ucsb.edu"))
        self.assertEqual(self.stats(THU, THU).status_code, 403)


    def test_top_place_and_riders(self):
        def ride(pickup, dropoff, phone):
            Ride.objects.create(
                rider_name="R", rider_phone=phone, pickup_time=local(THU, 9), driver=self.driver,
                pickup_name=pickup, dropoff_name=dropoff,
            )

        ride("Library", "UCen", "8055550001")
        ride("library ", "Storke Tower", "8055550001")
        ride("UCen", "Library", "8055550002")
        ride("Davidson Library", "Library", "8055550001")
        with at(THU, 12):
            r = self.stats(THU, THU).json()
        self.assertEqual(r["top_place"], {"name": "Library", "rides": 4})  # counted once per ride
        self.assertEqual((r["total"], r["riders"]), (4, 2))
