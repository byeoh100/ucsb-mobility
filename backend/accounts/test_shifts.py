from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from .models import AdminEmail, Driver, DriverShift

User = get_user_model()


@override_settings(SERVICE_START="07:00", SERVICE_END="19:00")
class ShiftApiTests(TestCase):
    def setUp(self):
        AdminEmail.objects.create(email="boss@ucsb.edu")
        self.client.force_login(User.objects.create(username="boss@ucsb.edu", email="boss@ucsb.edu"))
        self.dana = Driver.objects.create(email="dana@ucsb.edu", name="Dana", color="#1a73e8")

    def put(self, shifts, driver=None):
        return self.client.put(
            f"/api/drivers/{(driver or self.dana).id}/shifts/", {"shifts": shifts}, content_type="application/json"
        )

    def test_replace_week_and_list(self):
        r = self.put([
            {"weekday": 2, "start": "14:00", "end": "18:00"},
            {"weekday": 0, "start": "09:00", "end": "13:00"},
            {"weekday": 0, "start": "15:30", "end": "17:00"},
        ])
        self.assertEqual(r.status_code, 200, r.json())
        expected = [
            {"weekday": 0, "start": "09:00", "end": "13:00"},
            {"weekday": 0, "start": "15:30", "end": "17:00"},
            {"weekday": 2, "start": "14:00", "end": "18:00"},
        ]
        self.assertEqual(r.json()["shifts"], expected)  # sorted by day, then time
        self.assertEqual(self.client.get("/api/drivers/").json()[0]["shifts"], expected)
        # Replacing, not adding:
        self.put([{"weekday": 4, "start": "07:00", "end": "08:00"}])
        self.assertEqual(DriverShift.objects.count(), 1)
        self.assertEqual(self.put([]).json()["shifts"], [])

    def test_validation(self):
        bad = {
            "quarter hours only": [{"weekday": 0, "start": "09:10", "end": "10:00"}],
            "end after start": [{"weekday": 0, "start": "10:00", "end": "10:00"}],
            "within hours": [{"weekday": 0, "start": "06:45", "end": "10:00"}],
            "within hours (end)": [{"weekday": 0, "start": "17:00", "end": "19:15"}],
            "weekdays only": [{"weekday": 5, "start": "09:00", "end": "10:00"}],
            "no overlaps": [
                {"weekday": 1, "start": "09:00", "end": "12:00"},
                {"weekday": 1, "start": "11:45", "end": "13:00"},
            ],
        }
        for label, shifts in bad.items():
            with self.subTest(label):
                self.assertEqual(self.put(shifts).status_code, 400)
        self.assertFalse(DriverShift.objects.exists())

    def test_back_to_back_is_fine(self):
        r = self.put([
            {"weekday": 1, "start": "09:00", "end": "12:00"},
            {"weekday": 1, "start": "12:00", "end": "13:00"},
        ])
        self.assertEqual(r.status_code, 200)

    def test_dispatch_only(self):
        self.client.force_login(User.objects.create(username="dana@ucsb.edu", email="dana@ucsb.edu"))
        self.assertEqual(self.put([]).status_code, 403)

    def test_plain_put_on_driver_not_allowed(self):
        r = self.client.put(f"/api/drivers/{self.dana.id}/", {"name": "X"}, content_type="application/json")
        self.assertEqual(r.status_code, 405)

    def test_removing_driver_removes_shifts(self):
        self.put([{"weekday": 0, "start": "09:00", "end": "10:00"}])
        self.client.delete(f"/api/drivers/{self.dana.id}/")
        self.assertFalse(DriverShift.objects.exists())
