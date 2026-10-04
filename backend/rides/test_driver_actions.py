from datetime import date, datetime, time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from accounts.models import AdminEmail, Driver

from .models import Ride

User = get_user_model()
D = date(2026, 10, 14)


def local(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


def at(day, hour, minute=0):
    return mock.patch("django.utils.timezone.now", return_value=local(day, hour, minute))


class DriverActionTests(TestCase):
    def setUp(self):
        self.dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana", color="#1a73e8")
        self.sam = Driver.objects.create(email="sam@ucsb.edu", name="Sam", color="#d93025")
        self.dana_user = User.objects.create(username="dana@ucsb.edu", email="dana@ucsb.edu")
        self.client.force_login(self.dana_user)

    def ride(self, hour, minute=0, driver=None, day=D):
        return Ride.objects.create(
            rider_name="R", rider_phone="8055550000", rider_email="r@ucsb.edu",
            pickup_time=local(day, hour, minute), pickup_name="A", dropoff_name="B",
            driver=driver if driver is not None else self.dana,
        )

    def start(self, ride):
        return self.client.post(f"/api/rides/{ride.id}/start/")

    def test_start_marks_on_the_way(self):
        ride = self.ride(10)
        with at(D, 9, 50):
            r = self.start(ride)
        self.assertEqual(r.status_code, 200, r.json())
        self.assertEqual(r.json()["status"], "on_the_way")
        ride.refresh_from_db()
        self.assertEqual(ride.started_at, local(D, 9, 50))

    def test_starting_next_ride_completes_previous(self):
        first, second = self.ride(10), self.ride(10, 30)
        with at(D, 9, 50):
            self.start(first)
        with at(D, 10, 12):
            self.start(second)
            statuses = {r["id"]: r["status"] for r in self.client.get(f"/api/rides/?date={D}").json()}
        self.assertEqual((statuses[first.id], statuses[second.id]), ("completed", "on_the_way"))

    def test_start_twice_keeps_first_time(self):
        ride = self.ride(10)
        with at(D, 9, 50):
            self.start(ride)
        with at(D, 9, 55):
            self.start(ride)
        ride.refresh_from_db()
        self.assertEqual(ride.started_at, local(D, 9, 50))

    def test_only_assigned_driver(self):
        sams = self.ride(10, driver=self.sam)
        unassigned = Ride.objects.create(
            rider_name="R", rider_phone="8055550000", rider_email="r@ucsb.edu",
            pickup_time=local(D, 11), pickup_name="A", dropoff_name="B",
        )
        with at(D, 9):
            self.assertEqual(self.start(sams).status_code, 403)
            self.assertEqual(self.start(unassigned).status_code, 403)
            AdminEmail.objects.create(email="boss@ucsb.edu")
            self.client.force_login(User.objects.create(username="boss@ucsb.edu", email="boss@ucsb.edu"))
            self.assertEqual(self.start(self.ride(12)).status_code, 403)  # admins don't drive

    def test_only_todays_rides(self):
        tomorrow = self.ride(10, day=D + timedelta(days=1))
        with at(D, 9):
            r = self.start(tomorrow)
        self.assertEqual(r.status_code, 400)
        self.assertIn("today", r.json()["error"])

    def test_completed_ride_cannot_start(self):
        ride = self.ride(10)
        with at(D, 10, 20):  # 20 min after pickup: completed
            r = self.start(ride)
        self.assertEqual((r.status_code, r.json()["error"]), (400, "This ride is already completed."))

    def test_undo(self):
        ride = self.ride(10)
        with at(D, 9, 50):
            self.start(ride)
            r = self.client.post(f"/api/rides/{ride.id}/unstart/")
            self.assertEqual(r.json()["status"], "not_confirmed")
            self.assertEqual(self.client.post(f"/api/rides/{ride.id}/unstart/").status_code, 400)

    def test_session_includes_driver_profile(self):
        user = self.client.get("/api/auth/session/").json()["user"]
        self.assertEqual(user["driver"], {"id": self.dana.id, "name": "Dana", "color": "#1a73e8"})


class StatusPrivacyTests(TestCase):
    """Drivers only see progress (status, rider 👍, start time) on their own rides."""

    def setUp(self):
        self.dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana", color="#1a73e8")
        self.sam = Driver.objects.create(email="sam@ucsb.edu", name="Sam", color="#d93025")
        self.dana_user = User.objects.create(username="dana@ucsb.edu", email="dana@ucsb.edu")

        def ride(driver, hour):
            return Ride.objects.create(
                rider_name=f"R{hour}", rider_phone="8055550000", rider_email="r@ucsb.edu",
                pickup_time=local(D, hour), pickup_name="A", dropoff_name="B", driver=driver,
                started_at=local(D, 9, 50), rider_confirmed_at=local(D, 9, 51),
            )

        self.mine, self.sams, self.unassigned = ride(self.dana, 10), ride(self.sam, 11), ride(None, 12)

    def listing(self):
        with at(D, 9, 55):
            return {r["id"]: r for r in self.client.get(f"/api/rides/?date={D}").json()}

    def test_driver_sees_own_progress_only(self):
        self.client.force_login(self.dana_user)
        rides = self.listing()
        self.assertEqual(rides[self.mine.id]["status"], "on_the_way")
        self.assertTrue(rides[self.mine.id]["rider_confirmed"])
        self.assertIsNotNone(rides[self.mine.id]["started_at"])
        for other in (self.sams.id, self.unassigned.id):
            self.assertEqual(
                (rides[other]["status"], rides[other]["rider_confirmed"], rides[other]["started_at"]), (None, None, None)
            )
            # Still enough to arrange swaps:
            self.assertEqual(rides[other]["pickup_name"], "A")
        self.assertEqual(rides[self.sams.id]["driver_name"], "Sam")

    def test_dispatch_sees_everything(self):
        AdminEmail.objects.create(email="boss@ucsb.edu")
        self.client.force_login(User.objects.create(username="boss@ucsb.edu", email="boss@ucsb.edu"))
        rides = self.listing()
        self.assertTrue(all(r["status"] is not None for r in rides.values()))

    def test_single_ride_endpoint_also_hides(self):
        self.client.force_login(self.dana_user)
        with at(D, 9, 55):
            r = self.client.get(f"/api/rides/{self.sams.id}/").json()
        self.assertIsNone(r["status"])


class MarkCompleteTests(TestCase):
    """Optional "Mark complete": closes the rider link early."""

    def setUp(self):
        self.dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana", color="#1a73e8")
        self.sam = Driver.objects.create(email="sam@ucsb.edu", name="Sam", color="#d93025")
        self.client.force_login(User.objects.create(username="dana@ucsb.edu", email="dana@ucsb.edu"))
        self.ride = Ride.objects.create(
            rider_name="R", rider_phone="8055550000", rider_email="r@ucsb.edu",
            pickup_time=local(D, 10), pickup_name="A", dropoff_name="B", driver=self.dana,
        )

    def post(self, action, ride=None):
        return self.client.post(f"/api/rides/{(ride or self.ride).id}/{action}/")

    def rider_phase(self):
        return self.client.get(f"/api/r/{self.ride.link_token}/").json()["phase"]

    def test_complete_closes_rider_link_and_stops_location(self):
        from .models import DriverLocation

        with at(D, 9, 50):
            self.post("start")
            self.assertEqual(self.rider_phase(), "live")
        with at(D, 9, 58):
            r = self.post("complete")
            self.assertEqual((r.status_code, r.json()["status"]), (200, "completed"))
            self.assertEqual(self.rider_phase(), "complete")
            sent = self.client.post("/api/location/", {"lat": 34.41, "lng": -119.84}, content_type="application/json")
            self.assertEqual(sent.status_code, 409)  # sharing stops
        self.assertFalse(DriverLocation.objects.exists())
        with at(D, 10, 16):
            self.assertEqual(self.rider_phase(), "expired")  # then expires as usual

    def test_only_when_on_the_way(self):
        with at(D, 9, 50):
            self.assertEqual(self.post("complete").status_code, 400)

    def test_only_assigned_driver(self):
        sams = Ride.objects.create(
            rider_name="R", rider_phone="8055550000", rider_email="r@ucsb.edu",
            pickup_time=local(D, 11), pickup_name="A", dropoff_name="B", driver=self.sam, started_at=local(D, 10, 50),
        )
        with at(D, 10, 55):
            self.assertEqual(self.post("complete", sams).status_code, 403)

    def test_reopen_after_mistake(self):
        with at(D, 9, 50):
            self.post("start")
            self.post("complete")
            r = self.post("reopen")
            self.assertEqual(r.json()["status"], "on_the_way")
            self.assertEqual(self.rider_phase(), "live")
            self.assertEqual(self.post("reopen").status_code, 400)  # not marked complete anymore

    def test_cannot_reopen_after_window_or_next_ride(self):
        nxt = Ride.objects.create(
            rider_name="N", rider_phone="8055550001", rider_email="n@ucsb.edu",
            pickup_time=local(D, 10, 30), pickup_name="A", dropoff_name="B", driver=self.dana,
        )
        with at(D, 9, 50):
            self.post("start")
            self.post("complete")
        with at(D, 9, 55):
            self.post("start", nxt)
            self.assertEqual(self.post("reopen").status_code, 400)  # driver has moved on
        self.ride.refresh_from_db()
        self.assertIsNotNone(self.ride.completed_at)  # failed reopen changed nothing

    def test_completed_ride_cannot_be_restarted(self):
        with at(D, 9, 50):
            self.post("start")
            self.post("complete")
            self.assertEqual(self.post("start").status_code, 400)

    def test_completion_time_private_to_assigned_driver(self):
        with at(D, 9, 50):
            self.post("start")
            self.post("complete")
        self.client.force_login(User.objects.create(username="sam@ucsb.edu", email="sam@ucsb.edu"))
        with at(D, 9, 55):
            listed = self.client.get(f"/api/rides/?date={D}").json()[0]
        self.assertEqual((listed["status"], listed["completed_at"]), (None, None))
