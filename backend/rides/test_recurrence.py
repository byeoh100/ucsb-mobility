from datetime import date, datetime, time
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import AdminEmail, Driver

from .models import Ride
from .recurrence import repeat_dates

User = get_user_model()

MON = date(2026, 10, 12)  # a Monday
NOW = timezone.make_aware(datetime(2026, 10, 12, 8, 0))  # Monday 8 AM, campus time
MONDAY, WEDNESDAY, FRIDAY = 0, 2, 4


def campus(ride):
    return timezone.localtime(ride.pickup_time)


class RepeatDatesTests(TestCase):
    def test_chosen_weekdays_only_inclusive(self):
        days = repeat_dates(MON, {MONDAY, WEDNESDAY}, date(2026, 10, 26))
        self.assertEqual(
            days, [date(2026, 10, 12), date(2026, 10, 14), date(2026, 10, 19), date(2026, 10, 21), date(2026, 10, 26)]
        )


@override_settings(ALLOWED_EMAIL_DOMAINS=["ucsb.edu"])
@mock.patch("django.utils.timezone.now", return_value=NOW)
class RepeatApiTests(TestCase):
    def setUp(self):
        AdminEmail.objects.create(email="admin@ucsb.edu")
        self.client.force_login(User.objects.create(username="admin@ucsb.edu", email="admin@ucsb.edu"))
        self.dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana", color="#1a73e8")
        self.sam = Driver.objects.create(email="sam@ucsb.edu", name="Sam", color="#d93025")

    def add(self, days=(MONDAY, WEDNESDAY), until="2026-10-30", when="2026-10-12T09:30", **extra):
        body = {
            "rider_name": "Alex Kim", "rider_phone": "8055550101", "pickup_time": when,
            "pickup_name": "Library", "dropoff_name": "Phelps Hall", "driver": self.dana.id,
            "notes": "Side door", "repeat": {"days": list(days), "until": until}, **extra,
        }
        return self.client.post("/api/rides/", body, content_type="application/json")

    def test_creates_one_ride_per_matching_day(self, _now):
        r = self.add()
        self.assertEqual(r.status_code, 201, r.json())
        self.assertEqual(r.json()["series_count"], 6)  # Mon+Wed for three weeks
        rides = list(Ride.objects.order_by("pickup_time"))
        self.assertEqual([campus(x).date().weekday() for x in rides], [0, 2] * 3)
        self.assertTrue(all(campus(x).time() == time(9, 30) for x in rides))
        self.assertEqual(len({x.series for x in rides}), 1)
        self.assertEqual(len({x.link_token for x in rides}), 6)  # each has its own link
        self.assertTrue(all(x.driver == self.dana and x.notes == "Side door" for x in rides))

    def test_same_campus_time_across_daylight_saving(self, _now):
        # DST ends Nov 1, 2026: the ride stays at 9:30 AM local before and after.
        self.add(days=[FRIDAY], until="2026-11-13")
        self.assertTrue(all(campus(x).time() == time(9, 30) for x in Ride.objects.all()))

    def test_start_day_not_chosen_starts_on_next_match(self, _now):
        r = self.add(days=[WEDNESDAY], until="2026-10-21")
        self.assertEqual(r.json()["pickup_time"][:10], "2026-10-14")
        self.assertEqual(Ride.objects.count(), 2)

    def test_validation(self, _now):
        self.assertIn("before", self.add(until="2026-10-11").json()["repeat"][0])
        self.assertIn("at most", self.add(until="2027-03-01").json()["repeat"][0])
        self.assertIn("None of the chosen days", self.add(days=[FRIDAY], until="2026-10-13").json()["repeat"][0])
        self.assertEqual(self.add(days=[]).status_code, 400)
        self.assertEqual(self.add(days=[7]).status_code, 400)
        self.assertEqual(self.add(when="2026-10-12T20:00").status_code, 400)  # outside hours
        self.assertEqual(Ride.objects.count(), 0)  # nothing half-created

    def test_plain_add_still_works(self, _now):
        r = self.add(repeat=None)
        self.assertEqual((r.status_code, r.json()["series"]), (201, None))
        self.assertNotIn("series_count", r.json())

    def test_repeat_not_allowed_on_edit(self, _now):
        ride_id = self.add().json()["id"]
        r = self.client.patch(f"/api/rides/{ride_id}/", {"repeat": {"days": [0], "until": "2026-10-30"}},
                              content_type="application/json")
        self.assertEqual(r.status_code, 400)

    def series(self):
        return list(Ride.objects.order_by("pickup_time"))

    def test_edit_this_ride_only(self, _now):
        self.add()
        first, second = self.series()[:2]
        self.client.patch(f"/api/rides/{second.id}/", {"driver": self.sam.id}, content_type="application/json")
        self.assertEqual([x.driver_id for x in self.series()], [self.dana.id, self.sam.id] + [self.dana.id] * 4)

    def test_edit_this_and_later(self, _now):
        self.add()
        rides = self.series()
        third = rides[2]
        rides[4].started_at = NOW  # already under way: left alone
        rides[4].save()
        r = self.client.patch(
            f"/api/rides/{third.id}/?scope=following",
            {"driver": self.sam.id, "pickup_time": f"{campus(third).date()}T10:15", "notes": "Front door"},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.json())
        after = self.series()
        self.assertEqual([x.driver_id == self.sam.id for x in after], [False, False, True, True, False, True])
        self.assertEqual([campus(x).time() for x in after][2:4], [time(10, 15)] * 2)
        self.assertEqual(campus(after[0]).time(), time(9, 30))  # earlier rides untouched
        self.assertEqual([x.notes for x in after], ["Side door"] * 2 + ["Front door"] * 2 + ["Side door", "Front door"])
        # Each kept its own date.
        self.assertEqual([campus(x).date() for x in after], [campus(x).date() for x in rides])

    def test_edit_following_cannot_change_day(self, _now):
        self.add()
        second = self.series()[1]
        r = self.client.patch(f"/api/rides/{second.id}/?scope=following", {"pickup_time": "2026-10-15T09:30"},
                              content_type="application/json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("another day", r.json()["error"])
        # ...but one ride on its own can move.
        r = self.client.patch(f"/api/rides/{second.id}/", {"pickup_time": "2026-10-15T09:30"},
                              content_type="application/json")
        self.assertEqual(r.status_code, 200)

    def test_delete_this_ride_only(self, _now):
        self.add()
        self.client.delete(f"/api/rides/{self.series()[1].id}/")
        self.assertEqual(Ride.objects.count(), 5)

    def test_delete_this_and_later(self, _now):
        self.add()
        third = self.series()[2]  # Mon Oct 19
        Ride.objects.create(rider_name="Other", rider_phone="8055550000", pickup_time=campus(third).replace(hour=11),
                            pickup_name="A", dropoff_name="B")
        r = self.client.delete(f"/api/rides/{third.id}/?scope=following")
        self.assertEqual(r.status_code, 204)
        names = [x.rider_name for x in Ride.objects.order_by("pickup_time")]
        self.assertEqual(names, ["Alex Kim", "Alex Kim", "Other"])  # other rides untouched

    def test_scope_ignored_for_single_rides(self, _now):
        ride_id = self.add(repeat=None).json()["id"]
        other = self.add(repeat=None, rider_name="Bo").json()["id"]
        self.client.delete(f"/api/rides/{ride_id}/?scope=following")
        self.assertEqual(list(Ride.objects.values_list("id", flat=True)), [other])

    def test_drivers_cannot_add_series(self, _now):
        self.client.force_login(User.objects.create(username="dana@ucsb.edu", email="dana@ucsb.edu"))
        self.assertEqual(self.add().status_code, 403)
