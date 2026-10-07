from datetime import datetime, time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import AdminEmail, Driver

from .models import Ride
from .status import COMPLETED, NOT_CONFIRMED, ON_THE_WAY, statuses_for

User = get_user_model()


def local(day, hour, minute=0):
    return timezone.make_aware(datetime.combine(day, time(hour, minute)))


class StatusTests(TestCase):
    def setUp(self):
        self.driver = Driver.objects.create(email="d@ucsb.edu", name="D", color="#1a73e8")
        self.day = timezone.localdate()

    def ride(self, hour, minute=0, started=None, driver=True):
        return Ride.objects.create(
            rider_name="R", rider_phone="8055550000", rider_email="r@ucsb.edu",
            pickup_time=local(self.day, hour, minute),
            pickup_name="A", dropoff_name="B",
            driver=self.driver if driver else None, started_at=started,
        )

    def test_status_rules(self):
        now = local(self.day, 12, 0)
        waiting = self.ride(12, 10)
        early_started = self.ride(11, 50, started=local(self.day, 11, 40))
        late = self.ride(11, 30)  # 30 min ago, driver hasn't started it yet
        expired = self.ride(11, 0)  # 60 min ago, never started
        s = statuses_for([waiting, early_started, late, expired], now)
        self.assertEqual(s[waiting.id], NOT_CONFIRMED)
        self.assertEqual(s[early_started.id], ON_THE_WAY)
        self.assertEqual(s[late.id], NOT_CONFIRMED)  # a late driver can still start it
        self.assertEqual(s[expired.id], COMPLETED)

    def test_several_rides_on_the_way_at_once(self):
        now = local(self.day, 12, 0)
        first = self.ride(11, 55, started=local(self.day, 11, 45))
        second = self.ride(12, 5, started=local(self.day, 11, 58))
        s = statuses_for([first, second], now)
        self.assertEqual((s[first.id], s[second.id]), (ON_THE_WAY, ON_THE_WAY))

    def test_late_pickup_stays_on_the_way(self):
        # Pilot day 1: a pickup well after its time must not close on its own.
        r = self.ride(11, 20, started=local(self.day, 11, 15))
        self.assertEqual(statuses_for([r], local(self.day, 12, 0))[r.id], ON_THE_WAY)

    def test_exactly_60_minutes_after_is_completed(self):
        r = self.ride(11, 0, started=local(self.day, 10, 55))
        self.assertEqual(statuses_for([r], local(self.day, 11, 59))[r.id], ON_THE_WAY)
        self.assertEqual(statuses_for([r], local(self.day, 12, 0))[r.id], COMPLETED)


@override_settings(ALLOWED_EMAIL_DOMAINS=["ucsb.edu"])
class RideApiTests(TestCase):
    def setUp(self):
        AdminEmail.objects.create(email="admin@ucsb.edu")
        self.admin = User.objects.create(username="admin@ucsb.edu", email="admin@ucsb.edu")
        self.driver = Driver.objects.create(email="d@umail.ucsb.edu", name="Dana", color="#1a73e8")
        self.client.force_login(self.admin)
        self.tomorrow = timezone.localdate() + timedelta(days=1)

    def payload(self, **overrides):
        data = {
            "rider_name": "Alex Kim", "rider_phone": "(805) 555-0101", "rider_email": "Alex@UMAIL.ucsb.edu",
            "pickup_time": f"{self.tomorrow}T09:30", "pickup_name": "Library",
            "dropoff_name": "Phelps Hall",
            "driver": self.driver.id,
        }
        data.update(overrides)
        return data

    def create(self, **overrides):
        return self.client.post("/api/rides/", self.payload(**overrides), content_type="application/json")

    def test_create_and_list_by_date(self):
        r = self.create()
        self.assertEqual(r.status_code, 201, r.json())
        body = r.json()
        self.assertEqual((body["rider_phone"], body["rider_email"]), ("8055550101", "alex@umail.ucsb.edu"))
        self.assertEqual(len(body["link_token"]) >= 20, True)

        rides = self.client.get(f"/api/rides/?date={self.tomorrow}").json()
        self.assertEqual(len(rides), 1)
        self.assertEqual((rides[0]["driver_name"], rides[0]["driver_color"]), ("Dana", "#1a73e8"))
        self.assertEqual(rides[0]["status"], NOT_CONFIRMED)
        self.assertFalse(rides[0]["rider_confirmed"])
        self.assertEqual(self.client.get("/api/rides/").json(), [])  # today: none

    def test_notes_optional_and_trimmed(self):
        self.assertEqual(self.create().json()["notes"], "")
        body = self.create(notes="  Meet at the side door\n").json()
        self.assertEqual(body["notes"], "Meet at the side door")
        self.assertEqual(self.create(notes="x" * 1001).status_code, 400)

    def test_rider_page_never_shows_notes(self):
        token = self.create(notes="Uses crutches").json()["link_token"]
        self.assertNotIn("crutches", self.client.get(f"/api/r/{token}/").content.decode())

    def test_local_time_is_kept(self):
        self.create()
        ride = Ride.objects.get()
        self.assertEqual(timezone.localtime(ride.pickup_time).time(), time(9, 30))

    def test_pins_optional_and_read_only_for_dispatch(self):
        r = self.create(pickup_pin={"x": 0.5, "y": 0.5})  # ignored: riders set pins
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(r.json()["pickup_pin"])
        ride = Ride.objects.get()
        ride.pickup_x, ride.pickup_y = 0.25, 0.75
        ride.save()
        listed = self.client.get(f"/api/rides/?date={self.tomorrow}").json()[0]
        self.assertEqual(listed["pickup_pin"], {"x": 0.25, "y": 0.75})
        self.assertIsNone(listed["dropoff_pin"])

    def test_edit_keeps_past_time_but_rejects_moving_into_past(self):
        """Before 8 AM, yesterday's rides are still editable (not yet archived):
        saving one with its own time works; moving a ride into the past doesn't.
        The clock is frozen at 7 AM so this holds whenever the tests run."""
        from datetime import date

        today = date(2026, 10, 14)
        yesterday = today - timedelta(days=1)
        seven_am = mock.patch("django.utils.timezone.now", return_value=local(today, 7))
        ride = Ride.objects.create(
            rider_name="R", rider_phone="8055550101", rider_email="r@ucsb.edu", pickup_time=local(yesterday, 10),
            pickup_name="A", dropoff_name="B", driver=self.driver,
        )
        with seven_am:
            same = self.client.patch(f"/api/rides/{ride.id}/", {"pickup_time": f"{yesterday}T10:00", "driver": None},
                                     content_type="application/json")
            self.assertEqual(same.status_code, 200, same.json())
            moved = self.client.patch(f"/api/rides/{ride.id}/", {"pickup_time": f"{yesterday}T11:00"},
                                      content_type="application/json")
            self.assertEqual(moved.status_code, 400)

    def test_unassigned_allowed(self):
        r = self.create(driver=None)
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(r.json()["driver_name"])

    def test_rider_email_optional(self):
        for label, overrides in {"blank": {"rider_email": ""}, "spaces": {"rider_email": "   "}}.items():
            with self.subTest(label):
                r = self.create(**overrides)
                self.assertEqual((r.status_code, r.json()["rider_email"]), (201, ""))
        payload = self.payload()
        del payload["rider_email"]
        r = self.client.post("/api/rides/", payload, content_type="application/json")
        self.assertEqual((r.status_code, r.json()["rider_email"]), (201, ""))

    def test_rejections(self):
        yesterday = timezone.localdate() - timedelta(days=1)
        cases = {
            "before 7am": {"pickup_time": f"{self.tomorrow}T06:59"},
            "after 7pm": {"pickup_time": f"{self.tomorrow}T19:01"},
            "past date": {"pickup_time": f"{yesterday}T09:00"},
            "bad phone": {"rider_phone": "555-0101"},
            "non-UCSB email": {"rider_email": "alex@gmail.com"},
            "blank place": {"dropoff_name": "  "},
            "unknown driver": {"driver": 9999},
        }
        for label, overrides in cases.items():
            with self.subTest(label):
                self.assertEqual(self.create(**overrides).status_code, 400)

    def test_boundaries_allowed(self):
        self.assertEqual(self.create(pickup_time=f"{self.tomorrow}T07:00").status_code, 201)
        self.assertEqual(self.create(pickup_time=f"{self.tomorrow}T19:00").status_code, 201)

    def test_hours_message(self):
        r = self.create(pickup_time=f"{self.tomorrow}T19:30")
        self.assertEqual(r.json()["pickup_time"], ["Rides must be between 7:00 AM and 7:00 PM."])

    def test_ride_outside_new_hours_can_still_be_reassigned(self):
        ride_id = self.create().json()["id"]
        Ride.objects.filter(id=ride_id).update(
            pickup_time=timezone.make_aware(datetime.combine(self.tomorrow, time(20, 30)))  # booked before hours changed
        )
        r = self.client.patch(f"/api/rides/{ride_id}/", {"driver": None}, content_type="application/json")
        self.assertEqual(r.status_code, 200, r.json())

    @override_settings(SERVICE_START="06:30", SERVICE_END="21:15")
    def test_hours_are_a_setting(self):
        self.assertEqual(self.create(pickup_time=f"{self.tomorrow}T06:30").status_code, 201)
        r = self.create(pickup_time=f"{self.tomorrow}T21:16")
        self.assertEqual(r.json()["pickup_time"], ["Rides must be between 6:30 AM and 9:15 PM."])
        config = self.client.get("/api/auth/session/").json()["config"]
        self.assertEqual(config["service_hours"], {"start": "06:30", "end": "21:15"})

    def test_removing_driver_unassigns_rides(self):
        self.create()
        self.client.delete(f"/api/drivers/{self.driver.id}/")
        self.assertIsNone(Ride.objects.get().driver)

    def test_delete(self):
        ride_id = self.create().json()["id"]
        self.assertEqual(self.client.delete(f"/api/rides/{ride_id}/").status_code, 204)
        self.assertFalse(Ride.objects.exists())
        self.assertEqual(self.client.delete(f"/api/rides/{ride_id}/").status_code, 404)

    def test_bad_date_param(self):
        self.assertEqual(self.client.get("/api/rides/?date=tomorrow").status_code, 400)

    def test_permissions(self):
        ride_id = self.create().json()["id"]
        driver_user = User.objects.create(username="d@umail.ucsb.edu", email="d@umail.ucsb.edu")
        rider_user = User.objects.create(username="r@gmail.com", email="r@gmail.com")

        self.client.force_login(driver_user)
        self.assertEqual(self.client.get(f"/api/rides/?date={self.tomorrow}").status_code, 200)
        self.assertEqual(self.create().status_code, 403)
        self.assertEqual(self.client.delete(f"/api/rides/{ride_id}/").status_code, 403)

        self.client.force_login(rider_user)
        self.assertEqual(self.client.get("/api/rides/").status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get("/api/rides/").status_code, 403)
