from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from .models import AdminEmail, Driver

User = get_user_model()
BLUE, RED = "#1a73e8", "#d93025"


@override_settings(ALLOWED_EMAIL_DOMAINS=["ucsb.edu"])
class DriverApiTests(TestCase):
    def setUp(self):
        AdminEmail.objects.create(email="admin@ucsb.edu")
        self.admin = User.objects.create(username="admin@ucsb.edu", email="admin@ucsb.edu")
        self.client.force_login(self.admin)

    def create(self, **overrides):
        data = {"email": "dana@umail.ucsb.edu", "name": "Dana", "phone": "(805) 555-0123", "color": BLUE}
        data.update(overrides)
        return self.client.post("/api/drivers/", data, content_type="application/json")

    def test_create_normalizes_email_and_phone(self):
        r = self.create(email=" Dana@UMAIL.ucsb.edu ", phone="+1 805.555.0123")
        self.assertEqual(r.status_code, 201, r.json())
        self.assertEqual(r.json()["email"], "dana@umail.ucsb.edu")
        self.assertEqual(r.json()["phone"], "8055550123")

    def test_list_sorted_by_name(self):
        self.create(email="z@ucsb.edu", name="Zoe", color=BLUE)
        self.create(email="a@ucsb.edu", name="Ana", color=RED)
        self.assertEqual([d["name"] for d in self.client.get("/api/drivers/").json()], ["Ana", "Zoe"])

    def test_phone_optional(self):
        self.assertEqual(self.create(phone="").status_code, 201)

    def test_rejections(self):
        self.create()
        cases = {
            "duplicate email (any case)": {"email": "DANA@umail.ucsb.edu"},
            "non-UCSB email": {"email": "dana@gmail.com"},
            "admin email": {"email": "admin@ucsb.edu"},
            "bad phone": {"email": "x@ucsb.edu", "phone": "555-0123", "color": RED},
            "blank name": {"email": "y@ucsb.edu", "name": "   ", "color": RED},
            "unknown color": {"email": "z@ucsb.edu", "color": "#123456"},
            "color already taken": {"email": "w@ucsb.edu", "color": BLUE},
        }
        for label, overrides in cases.items():
            with self.subTest(label):
                self.assertEqual(self.create(**overrides).status_code, 400)

    def test_edit_keeps_own_email(self):
        driver_id = self.create().json()["id"]
        r = self.client.patch(f"/api/drivers/{driver_id}/", {"email": "dana@umail.ucsb.edu", "color": RED},
                              content_type="application/json")
        self.assertEqual(r.status_code, 200, r.json())
        self.assertEqual(Driver.objects.get().color, RED)

    def test_color_freed_after_delete_and_can_keep_own(self):
        first = self.create().json()["id"]
        # Saving a driver with their own color is fine.
        r = self.client.patch(f"/api/drivers/{first}/", {"color": BLUE}, content_type="application/json")
        self.assertEqual(r.status_code, 200)
        self.client.delete(f"/api/drivers/{first}/")
        self.assertEqual(self.create(email="next@ucsb.edu").status_code, 201)

    def test_taken_color_error_names_driver(self):
        self.create()
        r = self.create(email="w@ucsb.edu")
        self.assertIn("Dana already has this color", r.json()["color"][0])

    def test_delete(self):
        driver_id = self.create().json()["id"]
        self.assertEqual(self.client.delete(f"/api/drivers/{driver_id}/").status_code, 204)
        self.assertFalse(Driver.objects.exists())

    def test_colors(self):
        colors = self.client.get("/api/drivers/colors/").json()
        self.assertEqual(len(colors), 24)
        self.assertEqual(set(colors[0]), {"value", "label"})

    def test_admin_only(self):
        self.create()
        driver_user = User.objects.create(username="dana@umail.ucsb.edu", email="dana@umail.ucsb.edu")
        for user in (driver_user, User.objects.create(username="r@gmail.com", email="r@gmail.com")):
            self.client.force_login(user)
            self.assertEqual(self.client.get("/api/drivers/").status_code, 403)
        self.client.logout()
        self.assertEqual(self.client.get("/api/drivers/").status_code, 403)
