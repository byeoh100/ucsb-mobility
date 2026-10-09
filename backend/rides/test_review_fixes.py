"""Regression tests for issues found in the post-pilot-day bug review."""

from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from accounts.models import AdminEmail, Driver

from .archive import purge_expired
from .models import Ride
from .test_archive import at, local

User = get_user_model()
D = date(2026, 10, 14)


class Base(TestCase):
    def setUp(self):
        cache.clear()
        AdminEmail.objects.create(email="boss@ucsb.edu")
        self.dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana", color="#1a73e8")
        self.eli = Driver.objects.create(email="eli@ucsb.edu", name="Eli", color="#d93025")

    def ride(self, hour=10, minute=0, day=D, **kw):
        defaults = dict(rider_name="R", rider_phone="8055551234", rider_email="r@ucsb.edu",
                        pickup_time=local(day, hour, minute), pickup_name="A", dropoff_name="B", driver=self.dana)
        defaults.update(kw)
        return Ride.objects.create(**defaults)

    def sign_in(self, email):
        self.client.force_login(User.objects.get_or_create(username=email, email=email)[0])


class OtherDriversRidesTests(Base):
    def test_other_drivers_dont_get_rider_contact_or_link(self):
        self.ride()
        self.sign_in("eli@ucsb.edu")
        with at(D, 9):
            [row] = self.client.get(f"/api/rides/?date={D}").json()
        for field in ("link_token", "rider_phone", "rider_email", "notes", "status"):
            self.assertIsNone(row[field], field)
        self.assertEqual((row["rider_name"], row["pickup_name"]), ("R", "A"))  # still enough to arrange swaps

    def test_own_driver_and_dispatch_still_do(self):
        self.ride()
        for email in ("dana@ucsb.edu", "boss@ucsb.edu"):
            self.sign_in(email)
            with at(D, 9):
                [row] = self.client.get(f"/api/rides/?date={D}").json()
            self.assertEqual(row["rider_phone"], "8055551234")
            self.assertTrue(row["link_token"])


class CreateAndEditStatusTests(Base):
    def test_new_ride_answers_with_its_status(self):
        self.sign_in("boss@ucsb.edu")
        with at(D, 9):
            r = self.client.post("/api/rides/", {
                "rider_name": "R", "rider_phone": "8055551234", "pickup_time": local(D, 10).isoformat(),
                "pickup_name": "A", "dropoff_name": "B",
            }, content_type="application/json")
        self.assertEqual(r.status_code, 201, r.json())
        self.assertEqual(r.json()["status"], "not_confirmed")

    def test_edit_answers_with_status_after_the_edit(self):
        ride = self.ride(hour=10)
        self.sign_in("boss@ucsb.edu")
        with at(D, 12):  # 10:00 is past the cutoff: completed. Move it to 11:30: not any more.
            r = self.client.patch(f"/api/rides/{ride.id}/", {"pickup_time": local(D, 11, 30).isoformat()},
                                  content_type="application/json")
        self.assertEqual(r.json()["status"], "not_confirmed")


@override_settings(ARCHIVE_RETENTION_DAYS=30)
class PurgeTests(Base):
    def test_two_purges_at_once_count_each_ride_once(self):
        for _ in range(3):
            self.ride(day=D - timedelta(days=40))
        # The second purge starts after the first has counted but before it deletes.
        from . import archive

        real_delete = Ride.objects.filter(pk__in=[]).delete.__func__
        calls = {"n": 0}

        def delete_then_race(qs):
            if calls["n"] == 0:
                calls["n"] += 1
                purge_expired(local(D, 9))
            return real_delete(qs)

        with mock.patch("django.db.models.query.QuerySet.delete", delete_then_race):
            purge_expired(local(D, 9))
        self.dana.refresh_from_db()
        self.assertEqual(self.dana.purged_rides, 3)
        self.assertFalse(Ride.objects.exists())
        del archive


class StatsEdgeTests(Base):
    def test_pickup_at_closing_time_is_in_the_last_bar(self):
        self.ride(hour=19, minute=0)
        self.sign_in("boss@ucsb.edu")
        with at(D + timedelta(days=1), 12):
            r = self.client.get(f"/api/stats/?from={D}&to={D}").json()
        self.assertEqual(r["total"], 1)
        self.assertEqual(sum(h["rides"] for h in r["by_hour"]), 1)
        self.assertEqual(r["by_hour"][-1], {"hour": 18, "rides": 1})

    def test_range_is_at_most_366_dates(self):
        self.sign_in("boss@ucsb.edu")
        ok = self.client.get(f"/api/stats/?from={D - timedelta(days=365)}&to={D}")
        too_long = self.client.get(f"/api/stats/?from={D - timedelta(days=366)}&to={D}")
        self.assertEqual((ok.status_code, too_long.status_code), (200, 400))


class StaleLocationTests(Base):
    def test_last_trips_location_isnt_shown_on_the_next_trip(self):
        from .models import DriverLocation

        first = self.ride(hour=9, rider_phone="8055550001")
        second = self.ride(hour=12, rider_phone="8055550002")
        with at(D, 9, 50):
            DriverLocation.objects.create(driver=self.dana, lat=34.41264, lng=-119.848396)
        first.started_at, first.completed_at = local(D, 9), local(D, 9, 55)
        first.save()
        second.started_at = local(D, 11, 55)
        second.save()
        with at(D, 11, 56):
            page = self.client.get(f"/api/r/{second.link_token}/").json()
        self.assertIsNone(page["live"]["driver_location"])


class BadBodyTests(Base):
    def test_pins_with_a_non_object_body_is_a_400(self):
        ride = self.ride(hour=12)
        with at(D, 9):
            for body in (["pickup"], 5, "pickup"):
                r = self.client.put(f"/api/r/{ride.link_token}/pins/", body, content_type="application/json")
                self.assertEqual(r.status_code, 400, body)


class LookupCeilingTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_refused_requests_dont_use_up_the_shared_ceiling(self):
        from rest_framework.throttling import SimpleRateThrottle

        rates = {"ride_lookup": "2/min", "ride_lookup_number": "20/hour", "ride_lookup_global": "5/hour"}
        with mock.patch.object(SimpleRateThrottle, "THROTTLE_RATES", rates):
            codes = [self.client.get(f"/api/lookup/?phone=80555500{i:02d}", REMOTE_ADDR="10.0.0.1").status_code
                     for i in range(20)]
            self.assertEqual(codes.count(200), 2)
            # Someone else can still look up their ride.
            self.assertEqual(self.client.get("/api/lookup/?phone=8055559999", REMOTE_ADDR="10.0.0.2").status_code, 200)
