from datetime import date, datetime, time, timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import Driver

from .models import DriverLocation, Ride

D = date(2026, 10, 14)


def local(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


def at(hour, minute=0, day=D):
    return mock.patch("django.utils.timezone.now", return_value=local(day, hour, minute))


@override_settings(DISPATCH_PHONE="8055550100")
class RiderPageTests(TestCase):
    def setUp(self):
        cache.clear()  # reset rate limits between tests
        self.dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana Ortiz", color="#1a73e8")
        self.ride = self.make(10, 0, rider="Riley")

    def make(self, hour, minute, rider="R", driver="default", phone="8055551234"):
        return Ride.objects.create(
            rider_name=rider, rider_phone=phone, rider_email="r@ucsb.edu",
            pickup_time=local(D, hour, minute), pickup_name="Library", dropoff_name="Bren Hall",
            driver=self.dana if driver == "default" else driver,
        )

    def page(self, ride=None):
        return self.client.get(f"/api/r/{(ride or self.ride).link_token}/").json()

    def test_unknown_link(self):
        self.assertEqual(self.client.get("/api/r/not-a-real-token/").status_code, 404)

    def test_upcoming_shows_details_not_live_info(self):
        with at(9, 0):
            p = self.page()
        self.assertEqual(p["phase"], "upcoming")
        self.assertEqual(p["ride"]["pickup_name"], "Library")
        self.assertEqual(p["dispatch_phone"], "8055550100")
        self.assertNotIn("live", p)
        self.assertNotIn("rider_name", p["ride"])  # the page never shows who it's for

    def test_live_window_and_status(self):
        with at(9, 45):
            p = self.page()
        self.assertEqual(p["phase"], "live")
        self.assertEqual(p["live"]["status"], "not_confirmed")
        self.assertEqual(p["live"]["driver"], {"name": "Dana", "color": "#1a73e8"})

    def test_late_pickup_stays_live(self):
        with at(10, 30):  # driver hasn't started yet: still live, so the rider can see that
            self.assertEqual((self.page()["phase"], self.page()["live"]["status"]), ("live", "not_confirmed"))
        self.ride.started_at = local(D, 10, 35)
        self.ride.save()
        with at(10, 50):
            self.assertEqual((self.page()["phase"], self.page()["live"]["status"]), ("live", "on_the_way"))

    def test_expired_reveals_nothing(self):
        with at(11, 0):
            p = self.page()
        self.assertEqual(p, {"phase": "expired", "dispatch_phone": "8055550100"})

    def test_complete_when_driver_starts_next_ride(self):
        nxt = self.make(10, 20, rider="Next")
        self.ride.started_at = local(D, 9, 50)
        self.ride.save()
        nxt.started_at = local(D, 10, 5)
        nxt.save()
        with at(10, 6):
            self.assertEqual(self.page()["phase"], "complete")
        with at(10, 20):
            self.assertEqual(self.page()["phase"], "expired")

    def test_dropoffs_away(self):
        earlier1 = self.make(9, 40, rider="E1")
        self.make(9, 50, rider="E2")
        self.make(10, 30, rider="Later")  # after this ride: doesn't count
        earlier1.started_at = local(D, 9, 30)
        earlier1.save()
        with at(9, 46):
            live = self.page()["live"]
        self.assertEqual(live["dropoffs_away"], 2)  # on E1 now, then E2, then us
        self.assertEqual(live["status"], "not_confirmed")

    def test_unassigned_ride(self):
        ride = self.make(10, 0, driver=None)
        with at(9, 50):
            live = self.page(ride)["live"]
        self.assertEqual((live["driver"], live["dropoffs_away"], live["driver_location"]), (None, None, None))

    def test_driver_location_while_driving(self):
        DriverLocation.objects.create(driver=self.dana, lat=34.41264, lng=-119.848396)
        with at(9, 50):
            self.assertIsNone(self.page()["live"]["driver_location"])  # not driving yet
        self.ride.started_at = local(D, 9, 50)
        self.ride.save()
        with at(9, 50):
            loc = self.page()["live"]["driver_location"]
        self.assertTrue(loc["on_map"])
        self.assertNotIn("lat", loc)

    def test_thumbs_up_only_once_on_the_way(self):
        url = f"/api/r/{self.ride.link_token}/confirm/"
        with at(9, 50):
            self.assertEqual(self.client.post(url).status_code, 400)
        self.ride.started_at = local(D, 9, 50)
        self.ride.save()
        with at(9, 52):
            r = self.client.post(url)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["ride"]["rider_confirmed"])
        self.ride.refresh_from_db()
        self.assertEqual(self.ride.rider_confirmed_at, local(D, 9, 52))

    def test_pins(self):
        url = f"/api/r/{self.ride.link_token}/pins/"
        put = lambda body: self.client.put(url, body, content_type="application/json")
        with at(8, 0):
            r = put({"pickup": {"x": 0.5, "y": 0.25}, "dropoff": {"x": 0.8, "y": 0.6}})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()["ride"]["pickup_pin"], {"x": 0.5, "y": 0.25})
            self.assertEqual(put({"dropoff": None}).json()["ride"]["dropoff_pin"], None)
            self.assertEqual(self.page()["ride"]["pickup_pin"], {"x": 0.5, "y": 0.25})  # untouched
            self.assertEqual(put({"pickup": {"x": 1.5, "y": 0.2}}).status_code, 400)
            self.assertEqual(put({"pickup": {"x": "a"}}).status_code, 400)
        with at(11, 0):
            self.assertEqual(put({"pickup": None}).status_code, 400)  # expired
        self.ride.refresh_from_db()
        self.assertEqual((self.ride.pickup_x, self.ride.dropoff_x), (0.5, None))

    def test_pins_show_for_driver(self):
        with at(8, 0):
            self.client.put(f"/api/r/{self.ride.link_token}/pins/", {"pickup": {"x": 0.3, "y": 0.4}}, content_type="application/json")
        self.ride.refresh_from_db()
        self.assertEqual((self.ride.pickup_x, self.ride.pickup_y), (0.3, 0.4))


class LookupTests(TestCase):
    def setUp(self):
        cache.clear()
        dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana", color="#1a73e8")
        for hour, phone in [(10, "8055551234"), (14, "8055551234"), (11, "8055559999")]:
            Ride.objects.create(
                rider_name="R", rider_phone=phone, rider_email="r@ucsb.edu", pickup_time=local(D, hour),
                pickup_name="Library", dropoff_name="Bren Hall", driver=dana,
            )

    def lookup(self, phone):
        return self.client.get("/api/lookup/", {"phone": phone})

    def test_finds_upcoming_rides_any_format(self):
        with at(9, 0):
            rides = self.lookup("(805) 555-1234").json()
        self.assertEqual(len(rides), 2)
        self.assertEqual(set(rides[0]), {"pickup_time", "pickup_name", "dropoff_name", "link_token"})

    def test_skips_expired(self):
        with at(11, 0):
            self.assertEqual(len(self.lookup("8055551234").json()), 1)

    def test_finds_late_ride_still_under_way(self):
        with at(10, 30):
            self.assertEqual(len(self.lookup("8055551234").json()), 2)

    def test_bad_number(self):
        self.assertEqual(self.lookup("555").status_code, 400)

    def test_rate_limited(self):
        with at(9, 0):
            codes = [self.lookup("8055551234").status_code for _ in range(12)]
        self.assertEqual(codes[:10], [200] * 10)
        self.assertEqual(codes[10:], [429, 429])
