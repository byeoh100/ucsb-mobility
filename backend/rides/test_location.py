from datetime import date, datetime, time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from accounts.models import AdminEmail, Driver

from .geo import calibration, frontend_calibration, to_map
from .models import DriverLocation, Ride

User = get_user_model()
D = date(2026, 10, 14)
STORKE = (34.41264, -119.848396)


def local(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


def at(day, hour, minute=0, second=0):
    return mock.patch("django.utils.timezone.now", return_value=local(day, hour, minute) + timedelta(seconds=second))


class CalibrationTests(TestCase):
    def test_landmarks_land_near_their_pixels(self):
        for r in calibration()["residuals"]:
            self.assertLess(r["error_m"], 20, r["name"])

    def test_storke_tower_lands_on_its_label(self):
        p = to_map(*STORKE)
        self.assertLess(abs(p["x"] * 719 - 288), 12)
        self.assertLess(abs(p["y"] * 881 - 565), 12)
        self.assertTrue(p["on_map"])

    def test_off_campus_is_off_map(self):
        self.assertFalse(to_map(34.4208, -119.6982)["on_map"])  # downtown Santa Barbara

    def test_frontend_coefficients_match_server(self):
        c = frontend_calibration()
        lat, lng = 34.4150, -119.8460
        self.assertAlmostEqual(c["cx"][0] + c["cx"][1] * lng + c["cx"][2] * lat, to_map(lat, lng)["x"], places=9)
        self.assertAlmostEqual(c["cy"][0] + c["cy"][1] * lng + c["cy"][2] * lat, to_map(lat, lng)["y"], places=9)


class LocationSharingTests(TestCase):
    def setUp(self):
        self.dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana", color="#1a73e8")
        self.user = User.objects.create(username="dana@ucsb.edu", email="dana@ucsb.edu")
        self.client.force_login(self.user)
        self.ride = Ride.objects.create(
            rider_name="Riley", rider_phone="8055550000", rider_email="r@ucsb.edu",
            pickup_time=local(D, 10), pickup_name="Library", dropoff_name="Bren Hall", driver=self.dana,
        )

    def send(self, lat=STORKE[0], lng=STORKE[1], accuracy=8):
        return self.client.post("/api/location/", {"lat": lat, "lng": lng, "accuracy": accuracy}, content_type="application/json")

    def test_rejected_until_on_the_way(self):
        with at(D, 9, 50):
            r = self.send()
        self.assertEqual((r.status_code, r.json()["sharing"]), (409, False))
        self.assertFalse(DriverLocation.objects.exists())

    def test_accepted_while_on_the_way_and_overwritten(self):
        with at(D, 9, 50):
            self.client.post(f"/api/rides/{self.ride.id}/start/")
            self.assertEqual(self.send().json(), {"sharing": True})
            self.send(lat=34.4130)
        self.assertEqual(DriverLocation.objects.count(), 1)
        self.assertEqual(DriverLocation.objects.get().lat, 34.4130)

    def test_stops_after_undo(self):
        with at(D, 9, 50):
            self.client.post(f"/api/rides/{self.ride.id}/start/")
            self.send()
            self.client.post(f"/api/rides/{self.ride.id}/unstart/")
            self.assertEqual(self.send().status_code, 409)

    def test_bad_input(self):
        with at(D, 9, 50):
            self.client.post(f"/api/rides/{self.ride.id}/start/")
            self.assertEqual(self.client.post("/api/location/", {"lat": "x"}, content_type="application/json").status_code, 400)
            self.assertEqual(self.send(lat=200).status_code, 400)

    def test_only_drivers(self):
        for email in ("boss@ucsb.edu", "rider@gmail.com"):
            if email.startswith("boss"):
                AdminEmail.objects.create(email=email)
            self.client.force_login(User.objects.create(username=email, email=email))
            self.assertEqual(self.send().status_code, 403)

    def test_dispatch_sees_current_ride_and_map_position(self):
        AdminEmail.objects.create(email="boss@ucsb.edu")
        boss = User.objects.create(username="boss@ucsb.edu", email="boss@ucsb.edu")
        with at(D, 9, 50):
            self.client.post(f"/api/rides/{self.ride.id}/start/")
            self.send()
        self.client.force_login(boss)
        with at(D, 9, 50, 30):
            driver = self.client.get("/api/drivers/").json()[0]
        self.assertEqual(driver["current_ride"]["rider_name"], "Riley")
        loc = driver["location"]
        self.assertTrue(loc["on_map"] and loc["live"])
        self.assertEqual(loc["age_seconds"], 30)
        self.assertNotIn("lat", loc)  # raw GPS never leaves the server
        with at(D, 9, 52):
            self.assertFalse(self.client.get("/api/drivers/").json()[0]["location"]["live"])
        with at(D, 10, 30):  # late pickup: still on the way, still shown
            self.assertEqual(self.client.get("/api/drivers/").json()[0]["current_ride"]["rider_name"], "Riley")
        with at(D, 11, 0):  # 60 min cutoff: completed, no current ride, no location shown
            driver = self.client.get("/api/drivers/").json()[0]
        self.assertEqual((driver["current_ride"], driver["location"]), (None, None))

    def test_session_has_calibration(self):
        config = self.client.get("/api/auth/session/").json()["config"]
        self.assertEqual(len(config["map_calibration"]["cx"]), 3)
