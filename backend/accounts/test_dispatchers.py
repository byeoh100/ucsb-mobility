from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from .models import AdminEmail, Driver

User = get_user_model()


@override_settings(ALLOWED_EMAIL_DOMAINS=["ucsb.edu"])
class DispatcherApiTests(TestCase):
    def setUp(self):
        AdminEmail.objects.create(email="boss@ucsb.edu")
        self.boss = User.objects.create(username="boss@ucsb.edu", email="boss@ucsb.edu")
        self.client.force_login(self.boss)

    def add(self, email):
        return self.client.post("/api/dispatchers/", {"email": email}, content_type="application/json")

    def test_list_marks_you(self):
        rows = self.client.get("/api/dispatchers/").json()
        self.assertEqual([(r["email"], r["is_you"]) for r in rows], [("boss@ucsb.edu", True)])

    def test_add_normalizes_and_grants_access_immediately(self):
        r = self.add(" New.Person@UMAIL.ucsb.edu ")
        self.assertEqual((r.status_code, r.json()["email"]), (201, "new.person@umail.ucsb.edu"))
        newbie = User.objects.create(username="new.person@umail.ucsb.edu", email="new.person@umail.ucsb.edu")
        self.client.force_login(newbie)
        self.assertEqual(self.client.get("/api/auth/session/").json()["user"]["role"], "admin")

    def test_rejections(self):
        Driver.objects.create(email="drives@ucsb.edu", name="D", color="#1a73e8")
        for email, why in [("x@gmail.com", "domain"), ("boss@ucsb.edu", "duplicate"), ("drives@ucsb.edu", "driver")]:
            with self.subTest(why):
                self.assertEqual(self.add(email).status_code, 400)

    def test_remove_and_last_dispatcher_protection(self):
        other = self.add("second@ucsb.edu").json()["id"]
        self.assertEqual(self.client.delete(f"/api/dispatchers/{other}/").status_code, 204)
        mine = AdminEmail.objects.get(email="boss@ucsb.edu").id
        r = self.client.delete(f"/api/dispatchers/{mine}/")
        self.assertEqual(r.status_code, 400)
        self.assertIn("last dispatcher", r.json()["error"])

    def test_removing_yourself_ends_access(self):
        self.add("second@ucsb.edu")
        mine = AdminEmail.objects.get(email="boss@ucsb.edu").id
        self.assertEqual(self.client.delete(f"/api/dispatchers/{mine}/").status_code, 204)
        self.assertEqual(self.client.get("/api/dispatchers/").status_code, 403)

    def test_last_sign_in(self):
        from django.utils import timezone

        self.boss.last_login = timezone.now()
        self.boss.save()
        self.add("never@ucsb.edu")
        rows = {r["email"]: r["last_sign_in"] for r in self.client.get("/api/dispatchers/").json()}
        self.assertIsNotNone(rows["boss@ucsb.edu"])
        self.assertIsNone(rows["never@ucsb.edu"])

    def test_dispatch_only(self):
        Driver.objects.create(email="drives@ucsb.edu", name="D", color="#1a73e8")
        self.client.force_login(User.objects.create(username="drives@ucsb.edu", email="drives@ucsb.edu"))
        self.assertEqual(self.client.get("/api/dispatchers/").status_code, 403)
        self.assertEqual(self.add("sneaky@ucsb.edu").status_code, 403)
