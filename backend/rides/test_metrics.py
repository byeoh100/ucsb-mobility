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
