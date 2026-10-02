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


class DjangoAdminGateTests(TestCase):
    def test_follows_admin_list(self):
        user = User.objects.create(username="x@ucsb.edu", email="x@ucsb.edu", is_staff=True, is_superuser=True)
        self.client.force_login(user)
        # Stale Django flags alone don't grant access; the admin list does.
        self.assertEqual(self.client.get("/django-admin/").status_code, 302)
        AdminEmail.objects.create(email="x@ucsb.edu")
        self.assertEqual(self.client.get("/django-admin/").status_code, 200)

    def test_anonymous_sent_to_sign_in(self):
        r = self.client.get("/django-admin/", follow=True)
        self.assertEqual(r.redirect_chain[-1][0], "/sign-in?next=/django-admin/")

    def test_signed_in_non_admin_gets_403_not_a_loop(self):
        self.client.force_login(User.objects.create(username="d@ucsb.edu", email="d@ucsb.edu"))
        r = self.client.get("/django-admin/", follow=True)
        self.assertEqual(r.status_code, 403)

    def test_get_role_anonymous(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertIsNone(get_role(AnonymousUser()))
        self.assertEqual(Role.ADMIN, "admin")
