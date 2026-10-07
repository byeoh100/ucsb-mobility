from unittest import mock

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings

from .models import AdminEmail, Driver
from .roles import Role, get_role

User = get_user_model()
GOOGLE = "accounts.views.id_token.verify_oauth2_token"


def google_info(email, verified=True):
    return {"email": email, "email_verified": verified, "given_name": "Test", "family_name": "User"}


@override_settings(GOOGLE_CLIENT_ID="test-client", BOOTSTRAP_ADMIN_EMAIL="", ALLOWED_EMAIL_DOMAINS=["ucsb.edu"])
class SignInTests(TestCase):
    def google_sign_in(self, email, **kw):
        with mock.patch(GOOGLE, return_value=google_info(email, **kw)):
            return self.client.post("/api/auth/google/", {"credential": "x"}, content_type="application/json")

    def test_unknown_email_is_rider(self):
        r = self.google_sign_in("someone@gmail.com")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["user"]["role"], "rider")

    def test_driver_and_admin_roles(self):
        Driver.objects.create(email="drive@umail.ucsb.edu", name="D", color="#1a73e8")
        AdminEmail.objects.create(email="boss@ucsb.edu")
        self.assertEqual(self.google_sign_in("Drive@UMAIL.ucsb.edu").json()["user"]["role"], "driver")
        self.assertEqual(self.google_sign_in("boss@ucsb.edu").json()["user"]["role"], "admin")

    def test_role_changes_apply_without_resigning_in(self):
        self.google_sign_in("late@ucsb.edu")
        AdminEmail.objects.create(email="late@ucsb.edu")
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["role"], "admin")

    def test_unverified_email_rejected(self):
        self.assertEqual(self.google_sign_in("x@ucsb.edu", verified=False).status_code, 400)

    def test_bad_token_rejected(self):
        with mock.patch(GOOGLE, side_effect=ValueError("bad")):
            r = self.client.post("/api/auth/google/", {"credential": "x"}, content_type="application/json")
        self.assertEqual(r.status_code, 400)

    def test_sign_in_requires_csrf(self):
        client = self.client_class(enforce_csrf_checks=True)
        with mock.patch(GOOGLE, return_value=google_info("a@ucsb.edu")):
            r = client.post("/api/auth/google/", {"credential": "x"}, content_type="application/json")
        self.assertEqual(r.status_code, 403)

    def test_sign_out(self):
        self.google_sign_in("a@ucsb.edu")
        self.client.post("/api/auth/sign-out/")
        self.assertIsNone(self.client.get("/api/auth/session/").json()["user"])

    def test_shared_phone_handoff(self):
        # Pilot day 1: driver A signs out, driver B signs in on the same phone.
        Driver.objects.create(email="a@ucsb.edu", name="Driver A", color="#1a73e8")
        Driver.objects.create(email="b@ucsb.edu", name="Driver B", color="#d93025")
        self.google_sign_in("a@ucsb.edu")
        self.client.post("/api/auth/sign-out/")
        self.assertEqual(self.google_sign_in("b@ucsb.edu").json()["user"]["driver"]["name"], "Driver B")
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["email"], "b@ucsb.edu")

    def test_switching_without_sign_out_replaces_account(self):
        Driver.objects.create(email="a@ucsb.edu", name="Driver A", color="#1a73e8")
        Driver.objects.create(email="b@ucsb.edu", name="Driver B", color="#d93025")
        self.google_sign_in("a@ucsb.edu")
        self.google_sign_in("b@ucsb.edu")
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["driver"]["name"], "Driver B")

    def test_api_responses_are_never_cached(self):
        # Shared phones: the browser must always ask who's signed in.
        r = self.client.get("/api/auth/session/")
        self.assertIn("no-store", r["Cache-Control"])
        self.assertIn("private", r["Cache-Control"])
        self.assertIn("no-store", self.google_sign_in("a@ucsb.edu")["Cache-Control"])

    def test_google_sign_in_is_logged(self):
        with self.assertLogs("accounts.views", "INFO") as logs:
            self.google_sign_in("a@ucsb.edu")
        self.assertIn("Google sign-in: a@ucsb.edu (rider)", logs.output[0])


@override_settings(GOOGLE_CLIENT_ID="test-client", ALLOWED_EMAIL_DOMAINS=["ucsb.edu"])
class BootstrapTests(TestCase):
    def sign_in(self, email):
        with mock.patch(GOOGLE, return_value=google_info(email)):
            return self.client.post("/api/auth/google/", {"credential": "x"}, content_type="application/json")

    @override_settings(BOOTSTRAP_ADMIN_EMAIL="me@ucsb.edu")
    def test_bootstrap_adds_first_admin(self):
        self.assertEqual(self.sign_in("me@ucsb.edu").json()["user"]["role"], "admin")
        self.assertTrue(AdminEmail.objects.filter(email="me@ucsb.edu").exists())

    @override_settings(BOOTSTRAP_ADMIN_EMAIL="me@ucsb.edu")
    def test_bootstrap_ignored_once_admins_exist(self):
        AdminEmail.objects.create(email="other@ucsb.edu")
        self.assertEqual(self.sign_in("me@ucsb.edu").json()["user"]["role"], "rider")

    @override_settings(BOOTSTRAP_ADMIN_EMAIL="me@ucsb.edu")
    def test_bootstrap_only_for_that_email(self):
        self.assertEqual(self.sign_in("notme@ucsb.edu").json()["user"]["role"], "rider")
        self.assertFalse(AdminEmail.objects.exists())


@override_settings(ALLOWED_EMAIL_DOMAINS=["ucsb.edu"])
class EmailDomainTests(TestCase):
    def test_allowed_domains(self):
        for ok in ["a@ucsb.edu", "b@umail.ucsb.edu", "C@UCSB.EDU"]:
            AdminEmail(email=ok).full_clean()

    def test_rejected_domains(self):
        for bad in ["a@gmail.com", "a@notucsb.edu", "a@ucsb.edu.evil.com"]:
            with self.assertRaises(ValidationError, msg=bad):
                AdminEmail(email=bad).full_clean()

    def test_emails_stored_lowercase(self):
        self.assertEqual(AdminEmail.objects.create(email=" Me@UCSB.edu ").email, "me@ucsb.edu")


class DevLoginTests(TestCase):
    def test_disabled_by_default(self):
        r = self.client.post("/api/auth/dev/", {"email": "a@ucsb.edu"}, content_type="application/json")
        self.assertEqual(r.status_code, 404)

    @override_settings(DEBUG=True, DEV_LOGIN=True)
    def test_enabled_in_debug(self):
        r = self.client.post("/api/auth/dev/", {"email": "a@ucsb.edu"}, content_type="application/json")
        self.assertEqual(r.json()["user"]["role"], "rider")


class DjangoAdminAccessTests(TestCase):
    """The Django admin uses Django's defaults: developer superusers only."""

    def google_sign_in(self, email):
        with mock.patch(GOOGLE, return_value=google_info(email)), \
             override_settings(GOOGLE_CLIENT_ID="test-client"):
            self.client.post("/api/auth/google/", {"credential": "x"}, content_type="application/json")

    def test_dispatch_admin_cannot_open_django_admin(self):
        AdminEmail.objects.create(email="dispatch@ucsb.edu")
        self.google_sign_in("dispatch@ucsb.edu")
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["role"], "admin")
        user = User.objects.get(username="dispatch@ucsb.edu")
        self.assertFalse(user.is_staff or user.is_superuser)
        r = self.client.get("/django-admin/")
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r["Location"].startswith("/django-admin/login/"))

    def test_developer_superuser_can_open_django_admin(self):
        User.objects.create_superuser("dev", "dev@ucsb.edu", "a-long-dev-password")
        self.assertTrue(self.client.login(username="dev", password="a-long-dev-password"))
        self.assertEqual(self.client.get("/django-admin/").status_code, 200)

    def test_google_sign_in_keeps_existing_developer_password(self):
        # A developer whose superuser username is their Google email.
        User.objects.create_superuser("byeoh@ucsb.edu", "byeoh@ucsb.edu", "a-long-dev-password")
        self.google_sign_in("byeoh@ucsb.edu")
        user = User.objects.get(username="byeoh@ucsb.edu")
        self.assertTrue(user.check_password("a-long-dev-password"))
        self.assertTrue(user.is_superuser)

    def test_new_google_accounts_have_no_password(self):
        self.google_sign_in("new@ucsb.edu")
        self.assertFalse(User.objects.get(username="new@ucsb.edu").has_usable_password())

    def test_cleanup_migration_only_clears_google_accounts(self):
        import importlib

        from django.apps import apps

        old_admin = User.objects.create(username="old@ucsb.edu", is_staff=True, is_superuser=True)
        old_admin.set_unusable_password()
        old_admin.save()
        dev = User.objects.create_superuser("dev", "dev@ucsb.edu", "a-long-dev-password")

        migration = importlib.import_module("accounts.migrations.0003_revoke_google_account_staff")
        migration.revoke_google_account_staff(apps, None)

        old_admin.refresh_from_db()
        dev.refresh_from_db()
        self.assertFalse(old_admin.is_staff or old_admin.is_superuser)
        self.assertTrue(dev.is_staff and dev.is_superuser)

    def test_get_role_anonymous(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertIsNone(get_role(AnonymousUser()))
        self.assertEqual(Role.ADMIN, "admin")
