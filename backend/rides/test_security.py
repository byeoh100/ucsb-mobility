"""Regression tests for issues found in the pre-pilot security review."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import AdminEmail, Driver

from .models import Ride

User = get_user_model()


def make_ride(**kw):
    defaults = dict(rider_name="R", rider_phone="8055551234", rider_email="r@ucsb.edu",
                    pickup_time=timezone.now() + timedelta(hours=2), pickup_name="A", dropoff_name="B")
    defaults.update(kw)
    return Ride.objects.create(**defaults)


class LookupLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        make_ride()

    def lookup(self, phone="8055551234", ip=None):
        extra = {"HTTP_X_FORWARDED_FOR": ip} if ip else {}
        return self.client.get("/api/lookup/", {"phone": phone}, **extra)

    @override_settings(REST_FRAMEWORK={**__import__("django.conf").conf.settings.REST_FRAMEWORK, "NUM_PROXIES": 1})
    def test_spoofed_forwarded_for_does_not_reset_visitor_limit(self):
        # Behind one proxy, only the address the proxy appended counts.
        codes = [self.lookup(phone=f"80555500{i:02d}", ip=f"1.2.3.{i}, 9.9.9.9").status_code for i in range(12)]
        self.assertEqual(codes.count(429), 2)

    def test_one_number_limited_from_any_address(self):
        codes = []
        for i in range(22):
            codes.append(self.client.get("/api/lookup/", {"phone": "(805) 555-1234"},
                                         REMOTE_ADDR=f"10.0.{i // 250}.{i % 250}").status_code)
        self.assertEqual(codes[:20].count(429), 0)
        self.assertEqual(codes[20:], [429, 429])


class ArchivedRidePrivacyTests(TestCase):
    def setUp(self):
        self.driver = Driver.objects.create(email="d@ucsb.edu", name="D", color="#1a73e8")
        self.old = make_ride(pickup_time=timezone.now() - timedelta(days=5))
        self.today = make_ride(pickup_time=timezone.now() + timedelta(minutes=30))

    def test_driver_cannot_open_archived_ride(self):
        self.client.force_login(User.objects.create(username="d@ucsb.edu", email="d@ucsb.edu"))
        self.assertEqual(self.client.get(f"/api/rides/{self.old.id}/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/rides/{self.today.id}/").status_code, 200)

    def test_dispatch_still_can(self):
        AdminEmail.objects.create(email="boss@ucsb.edu")
        self.client.force_login(User.objects.create(username="boss@ucsb.edu", email="boss@ucsb.edu"))
        self.assertEqual(self.client.get(f"/api/rides/{self.old.id}/").status_code, 200)


class DjangoAdminLockoutTests(TestCase):
    def setUp(self):
        cache.clear()
        User.objects.create_superuser("dev", "dev@ucsb.edu", "a-long-dev-password-1")

    def attempt(self, password):
        return self.client.post("/django-admin/login/", {"username": "dev", "password": password})

    def test_locks_after_repeated_wrong_passwords(self):
        for i in range(10):
            self.assertEqual(self.attempt(f"wrong{i}").status_code, 200)  # normal "wrong password" page
        self.assertEqual(self.attempt("a-long-dev-password-1").status_code, 429)  # locked, even if correct

    def test_correct_password_still_works_and_resets(self):
        for i in range(3):
            self.attempt(f"wrong{i}")
        self.assertEqual(self.attempt("a-long-dev-password-1").status_code, 302)
        self.assertIsNone(cache.get("admin-login-failures:dev"))
