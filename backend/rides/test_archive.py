from datetime import date, datetime, time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import AdminEmail, Driver

from .archive import archive_cutoff, purge_expired
from .models import Ride

User = get_user_model()
D = date(2026, 10, 14)  # a fixed "today" for these tests


def local(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


def at(day, hour, minute=0):
    """Freeze the clock at a campus-local moment."""
    return mock.patch("django.utils.timezone.now", return_value=local(day, hour, minute))


@override_settings(ARCHIVE_RETENTION_DAYS=30)
class ArchiveTests(TestCase):
    def setUp(self):
        AdminEmail.objects.create(email="admin@ucsb.edu")
        self.admin = User.objects.create(username="admin@ucsb.edu", email="admin@ucsb.edu")
        self.driver = Driver.objects.create(email="d@ucsb.edu", name="Dana", color="#1a73e8")
        self.client.force_login(self.admin)

    def ride(self, day, hour=10):
        return Ride.objects.create(
            rider_name="R", rider_phone="8055550000", rider_email="r@ucsb.edu",
            pickup_time=local(day, hour), pickup_name="A", dropoff_name="B", driver=self.driver,
        )

    def test_cutoff_rolls_over_at_8am(self):
        self.assertEqual(archive_cutoff(local(D, 7, 59)), D - timedelta(days=1))
        self.assertEqual(archive_cutoff(local(D, 8, 0)), D)
        self.assertEqual(archive_cutoff(local(D, 23, 59)), D)

    def test_yesterday_stays_on_main_list_until_8am(self):
        self.ride(D - timedelta(days=1), hour=21)
        with at(D, 7, 30):
            self.assertEqual(len(self.client.get(f"/api/rides/?date={D - timedelta(days=1)}").json()), 1)
        with at(D, 8, 0):
            self.assertEqual(self.client.get(f"/api/rides/?date={D - timedelta(days=1)}").json(), [])

    def test_archived_rides_are_read_only(self):
        ride = self.ride(D - timedelta(days=1))
        with at(D, 9):
            r = self.client.patch(f"/api/rides/{ride.id}/", {"driver": None}, content_type="application/json")
            self.assertEqual(r.status_code, 400)
            self.assertIn("archived", r.json()["error"])
            self.assertEqual(self.client.delete(f"/api/rides/{ride.id}/").status_code, 400)
        ride.refresh_from_db()
        self.assertEqual(ride.driver, self.driver)

    def test_todays_rides_still_editable(self):
        ride = self.ride(D, hour=9)
        with at(D, 12):
            r = self.client.patch(f"/api/rides/{ride.id}/", {"driver": None}, content_type="application/json")
            self.assertEqual(r.status_code, 200)

    def test_archive_days_and_rides(self):
        self.ride(D - timedelta(days=1), 9)
        self.ride(D - timedelta(days=1), 15)
        self.ride(D - timedelta(days=3))
        self.ride(D)  # today: not archived
        with at(D, 9):
            body = self.client.get("/api/archive/days/").json()
            self.assertEqual(body["retention_days"], 30)
            self.assertEqual(body["days"], [
                {"date": str(D - timedelta(days=1)), "count": 2},
                {"date": str(D - timedelta(days=3)), "count": 1},
            ])
            rides = self.client.get(f"/api/archive/?date={D - timedelta(days=1)}").json()
            self.assertEqual(len(rides), 2)
            self.assertIn("started_at", rides[0])
            self.assertEqual(self.client.get(f"/api/archive/?date={D}").status_code, 400)
            self.assertEqual(self.client.get("/api/archive/?date=nope").status_code, 400)

    def test_retention_keeps_exactly_30_days(self):
        kept = self.ride(D - timedelta(days=30))
        gone = self.ride(D - timedelta(days=31))
        with at(D, 9):
            self.client.get("/api/archive/days/")  # purge runs on page loads
        self.assertTrue(Ride.objects.filter(id=kept.id).exists())
        self.assertFalse(Ride.objects.filter(id=gone.id).exists())

    def test_retention_window_also_waits_for_8am(self):
        edge = self.ride(D - timedelta(days=31))
        self.assertEqual(purge_expired(local(D, 7, 59)), 0)  # cutoff is still yesterday
        self.assertTrue(Ride.objects.filter(id=edge.id).exists())
        self.assertEqual(purge_expired(local(D, 8, 0)), 1)

    @override_settings(ARCHIVE_RETENTION_DAYS=7)
    def test_retention_is_configurable(self):
        self.ride(D - timedelta(days=8))
        with at(D, 9):
            self.client.get("/api/rides/")
        self.assertFalse(Ride.objects.exists())

    def test_archive_is_admin_only(self):
        driver_user = User.objects.create(username="d@ucsb.edu", email="d@ucsb.edu")
        self.client.force_login(driver_user)
        self.assertEqual(self.client.get("/api/archive/days/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/archive/?date={D}").status_code, 403)

    def test_session_tells_frontend_the_archive_hour(self):
        config = self.client.get("/api/auth/session/").json()["config"]
        self.assertEqual((config["archive_hour"], config["archive_retention_days"]), (8, 30))
