"""Regression tests for issues found in the post-pilot-day bug review."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from .models import AdminEmail

User = get_user_model()


class SignInBadBodyTests(TestCase):
    def setUp(self):
        cache.clear()

    @override_settings(FALLBACK_DISPATCH_PASSWORD="right-password")
    def test_backup_sign_in_with_odd_bodies_is_not_a_500(self):
        for body in ({"username": "dispatch", "password": 123}, [1], "x", {"username": ["dispatch"]}):
            r = self.client.post("/api/auth/backup/", body, content_type="application/json")
            self.assertIn(r.status_code, (400, 404), body)

    def test_google_sign_in_with_a_list_body_is_a_400(self):
        r = self.client.post("/api/auth/google/", [1], content_type="application/json")
        self.assertEqual(r.status_code, 400)


class BackupAddressNotADispatcherTests(TestCase):
    def test_backup_driver_address_cant_be_added_as_dispatcher(self):
        AdminEmail.objects.create(email="boss@ucsb.edu")
        self.client.force_login(User.objects.create(username="boss@ucsb.edu", email="boss@ucsb.edu"))
        r = self.client.post("/api/dispatchers/", {"email": "driver@backup.cartdispatch.invalid"},
                             content_type="application/json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(AdminEmail.objects.filter(email__startswith="driver@").exists())
