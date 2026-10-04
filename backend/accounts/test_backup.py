from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from .backup import BACKUP_DRIVER_NAME, email_for
from .models import AdminEmail, Driver

User = get_user_model()
ON = {"FALLBACK_DISPATCH_PASSWORD": "dispatch123", "FALLBACK_DRIVER_PASSWORD": "driver123"}


@override_settings(**ON, BOOTSTRAP_ADMIN_EMAIL="me@ucsb.edu", ALLOWED_EMAIL_DOMAINS=["ucsb.edu"])
class BackupSignInTests(TestCase):
    def setUp(self):
        cache.clear()

    def sign_in(self, username, password):
        return self.client.post("/api/auth/backup/", {"username": username, "password": password},
                                content_type="application/json")

    def role(self):
        user = self.client.get("/api/auth/session/").json()["user"]
        return user and user["role"]

    def test_dispatch_account_is_admin(self):
        r = self.sign_in("dispatch", "dispatch123")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["user"]["role"], "admin")
        self.assertEqual(self.client.get("/api/drivers/").status_code, 200)

    def test_driver_account_gets_a_driver_profile(self):
        r = self.sign_in("Driver", "driver123")  # username isn't case-sensitive
        self.assertEqual(r.json()["user"]["role"], "driver")
        driver = Driver.objects.get(email=email_for("driver"))
        self.assertEqual(driver.name, BACKUP_DRIVER_NAME)
        self.assertEqual(r.json()["user"]["driver"]["id"], driver.id)
        self.sign_in("driver", "driver123")
        self.assertEqual(Driver.objects.filter(email=email_for("driver")).count(), 1)  # reused, not duplicated

    def test_wrong_password_and_unknown_user(self):
        self.assertEqual(self.sign_in("dispatch", "nope").status_code, 400)
        self.assertEqual(self.sign_in("admin", "dispatch123").status_code, 400)
        self.assertIsNone(self.role())

    def test_lockout_after_repeated_failures(self):
        for _ in range(10):
            self.sign_in("dispatch", "guess")
        r = self.sign_in("dispatch", "dispatch123")  # even the right password waits out the lock
        self.assertEqual(r.status_code, 429)
        self.assertEqual(self.sign_in("driver", "driver123").status_code, 200)  # other account unaffected

    def test_requires_csrf(self):
        client = self.client_class(enforce_csrf_checks=True)
        r = client.post("/api/auth/backup/", {"username": "dispatch", "password": "dispatch123"},
                        content_type="application/json")
        self.assertEqual(r.status_code, 403)

    def test_switched_off_without_passwords(self):
        with override_settings(FALLBACK_DISPATCH_PASSWORD="", FALLBACK_DRIVER_PASSWORD=""):
            self.assertEqual(self.sign_in("dispatch", "").status_code, 404)
            self.assertFalse(self.client.get("/api/auth/session/").json()["config"]["backup_login"])

    def test_one_account_can_be_off(self):
        with override_settings(FALLBACK_DRIVER_PASSWORD=""):
            self.assertEqual(self.sign_in("driver", "").status_code, 400)
            self.assertEqual(self.sign_in("dispatch", "dispatch123").status_code, 200)

    def test_removing_password_cuts_off_signed_in_session(self):
        self.sign_in("dispatch", "dispatch123")
        self.assertEqual(self.role(), "admin")
        with override_settings(FALLBACK_DISPATCH_PASSWORD=""):
            self.assertEqual(self.role(), "rider")
            self.assertEqual(self.client.get("/api/drivers/").status_code, 403)

    def test_backup_accounts_cannot_use_django_admin(self):
        self.sign_in("dispatch", "dispatch123")
        user = User.objects.get(username="backup-dispatch")
        self.assertFalse(user.has_usable_password() or user.is_staff)
        self.assertEqual(self.client.get("/django-admin/").status_code, 302)

    def test_does_not_block_bootstrap_admin(self):
        self.sign_in("dispatch", "dispatch123")
        self.assertFalse(AdminEmail.objects.exists())  # backup dispatch isn't on the admin list

    def test_dispatch_can_edit_backup_driver(self):
        self.sign_in("driver", "driver123")
        driver = Driver.objects.get(email=email_for("driver"))
        self.client.post("/api/auth/sign-out/")
        self.sign_in("dispatch", "dispatch123")
        r = self.client.patch(f"/api/drivers/{driver.id}/", {"name": "Backup driver (Sam)", "email": driver.email},
                              content_type="application/json")
        self.assertEqual(r.status_code, 200, r.json())

    def test_no_free_color(self):
        from .models import DRIVER_COLORS

        for i, (color, _) in enumerate(DRIVER_COLORS):
            Driver.objects.create(email=f"d{i}@ucsb.edu", name=f"D{i}", color=color)
        r = self.sign_in("driver", "driver123")
        self.assertEqual(r.status_code, 409)
