import csv
import io
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from accounts.models import AdminEmail

from .form_import import FORM_HEADERS, LOCK_IN_ANSWER, parse_time, read_layout, split_route
from .models import Ride
from .test_archive import at, local

User = get_user_model()
TODAY = date(2026, 10, 14)  # a Wednesday
UNTIL = date(2026, 11, 13)


def sheet(*responses, headers=FORM_HEADERS):
    """A response sheet: each response is {header: value}; for repeated headers
    (the date and time columns) give a list, in column order."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(headers)
    for response in responses:
        row, used = [], {}
        for h in headers:
            value = response.get(h, "")
            if isinstance(value, list):
                n = used.get(h, 0)
                used[h] = n + 1
                value = value[n] if n < len(value) else ""
            row.append(value)
        writer.writerow(row)
    return out.getvalue()


def rider(name="Ana Lee", phone="(805) 555-0101", stamp="10/10/2026 9:15:00", **slots):
    r = {"First and Last Name:": name, "Timestamp": stamp, "Email Address": "ana@ucsb.edu",
         "Phone Number:": phone, "Do you have any mobility equipment? ": "Crutches",
         "LOCK-IN (fill out below once and it will repeat)": LOCK_IN_ANSWER}
    r.update(slots)
    return r


class ParsingTests(TestCase):
    def test_layout_finds_every_slot_despite_spacing(self):
        layout = read_layout(FORM_HEADERS)
        self.assertEqual(len([k for k in layout["slots"] if k[0] == 0]), 5)  # Monday #1-#5
        self.assertEqual(len([k for k in layout["slots"] if k[0] == 4]), 4)  # Friday #1-#4
        for slot in layout["slots"].values():
            self.assertEqual(len(slot["values"]), 2)
            self.assertIn("location", slot)
            self.assertIn("notes", slot)  # incl. "FRIDAY # 1 NOTES" and "TUESDAY  #2"

    def test_split_route(self):
        cases = {
            "Storke Tower to Library": ("Storke Tower", "Library"),
            "Storke Tower - Library": ("Storke Tower", "Library"),
            "Phelps Hall -> UCen.": ("Phelps Hall", "UCen"),
            "Phelps Hall->UCen": ("Phelps Hall", "UCen"),
            "  storke tower TO library ": ("storke tower", "library"),
            "Davidson Library (main) to UCen": ("Davidson Library (main)", "UCen"),
            "Toro Hall to Library": ("Toro Hall", "Library"),
            "Library": None,
            "to Library": None,
            "": None,
        }
        for text, expected in cases.items():
            self.assertEqual(split_route(text), expected, text)

    def test_parse_time(self):
        self.assertEqual(str(parse_time("7:30:00 AM")), "07:30:00")
        self.assertEqual(str(parse_time("12:00:00 PM")), "12:00:00")
        self.assertEqual(str(parse_time("12:15:00 AM")), "00:15:00")
        self.assertEqual(str(parse_time("1:05 pm")), "13:05:00")
        self.assertIsNone(parse_time("13:00:00 PM"))
        self.assertIsNone(parse_time("noon"))


@override_settings(SERVICE_START="07:00", SERVICE_END="19:00")
class ImportApiTests(TestCase):
    def setUp(self):
        AdminEmail.objects.create(email="boss@ucsb.edu")
        self.client.force_login(User.objects.create(username="boss@ucsb.edu", email="boss@ucsb.edu"))

    def preview(self, text, until=UNTIL):
        with at(TODAY, 9):
            return self.client.post("/api/form-import/preview/", {"csv": text, "until": until.isoformat()},
                                    content_type="application/json")

    def run_import(self, slots, until=UNTIL):
        with at(TODAY, 9):
            return self.client.post("/api/form-import/", {"slots": slots, "until": until.isoformat()},
                                    content_type="application/json")

    def test_preview_then_import_then_reimport(self):
        text = sheet(rider(**{
            "MONDAY Location #1 (Start to End)": "Storke Tower to Library",
            "MONDAY #1": ["9/28/2026", "7:30:00 AM"],
            "MONDAY #1 NOTES": "Side door",
            "THURSDAY Location #5 (Start to End)": "UCen - Phelps Hall",
            "THURSDAY #5": ["2:00:00 PM", "10/1/2026"],  # other order: still works
        }))
        r = self.preview(text)
        self.assertEqual(r.status_code, 200, r.json())
        slots = r.json()["slots"]
        self.assertEqual([(s["weekday"], s["pickup"], s["dropoff"]) for s in slots],
                         [(0, "Storke Tower", "Library"), (3, "UCen", "Phelps Hall")])
        monday = slots[0]
        self.assertEqual(monday["problems"], [])
        self.assertEqual(monday["starts"], "2026-10-19")  # 9/28 is past: next Monday from today
        self.assertEqual(monday["new_rides"], 4)  # Oct 19, 26, Nov 2, 9
        self.assertIn("Mobility equipment: Crutches", monday["notes"])
        self.assertIn("Side door", monday["notes"])
        self.assertEqual(slots[1]["starts"], "2026-10-15")

        r = self.run_import(slots)
        self.assertEqual(r.json()["series"], 2)
        rides = Ride.objects.order_by("pickup_time")
        self.assertEqual(rides.count(), 4 + 5)  # Thursdays Oct 15 - Nov 12
        first = rides.filter(pickup_name="Storke Tower").first()
        self.assertEqual(first.pickup_time, local(date(2026, 10, 19), 7, 30))
        self.assertEqual((first.rider_phone, first.rider_email), ("8055550101", "ana@ucsb.edu"))
        self.assertEqual(rides.filter(pickup_name="Storke Tower").values("series").distinct().count(), 1)

        # The same sheet again: nothing new.
        again = self.preview(text).json()["slots"]
        self.assertEqual([(s["new_rides"], s["existing_rides"]) for s in again], [(0, 4), (0, 5)])
        self.assertEqual(self.run_import(again).json()["rides"], 0)
        self.assertEqual(Ride.objects.count(), 9)

    def test_problems_and_fixing_a_location(self):
        text = sheet(
            rider(**{"MONDAY Location #1 (Start to End)": "Library",  # can't split
                     "MONDAY #1": ["10/19/2026", "9:00:00 AM"]}),
            rider(name="Bo", phone="555-01", **{"TUESDAY Location #1  (Start to End)": "A to B",
                                                "TUESDAY #1": ["10/20/2026", "9:00:00 AM"]}),
            rider(name="Cy", phone="8055550103", **{"WEDNESDAY Location #1  (Start to End)": "A to B",
                                                    "WEDNESDAY #1": ["10/21/2026", "9:30:00 PM"]}),
        )
        slots = self.preview(text).json()["slots"]
        self.assertEqual(slots[0]["problems"], ['Could not parse: "Library"'])
        self.assertEqual(slots[0]["location_problem"], 'Could not parse: "Library"')
        self.assertIn("10 digits", slots[1]["problems"][0])
        self.assertIn("outside hours", slots[2]["problems"][0])
        # Problems are skipped on import...
        result = self.run_import(slots).json()
        self.assertEqual((result["rides"], len(result["skipped"])), (0, 3))
        # ...until fixed: dispatch types the locations in.
        fixed = {**slots[0], "pickup": "Library", "dropoff": "UCen"}
        self.assertEqual(self.run_import([fixed]).json()["series"], 1)

    def test_every_response_counts_and_repeats_keep_the_earliest_start(self):
        text = sheet(
            # First response: Mondays 8:00 from Oct 26, Tuesdays 9:00.
            rider(stamp="10/1/2026 10:00:00", **{"MONDAY Location #1 (Start to End)": "A to B",
                                                  "MONDAY #1": ["10/26/2026", "8:00:00 AM"],
                                                  "TUESDAY Location #1  (Start to End)": "C to D",
                                                  "TUESDAY #1": ["10/20/2026", "9:00:00 AM"]}),
            # Sent again to add Wednesdays; repeats Mondays 8:00 but from an earlier date.
            rider(stamp="10/12/2026 10:00:00", **{"MONDAY Location #1 (Start to End)": "A to B",
                                                   "MONDAY #1": ["10/19/2026", "8:00:00 AM"],
                                                   "WEDNESDAY Location #1  (Start to End)": "E to F",
                                                   "WEDNESDAY #1": ["10/21/2026", "1:00:00 PM"]}),
            # Not LOCK-IN: one-offs are all kept, even at the same time.
            rider(stamp="10/13/2026 10:00:00", **{"LOCK-IN (fill out below once and it will repeat)": "",
                                                   "MONDAY Location #1 (Start to End)": "G to H",
                                                   "MONDAY #1": ["10/19/2026", "8:00:00 AM"]}),
        )
        slots = self.preview(text).json()["slots"]
        summary = [(s["row"], s["weekday"], s["pickup"], s["starts"], s["lock_in"]) for s in slots]
        self.assertEqual(summary, [
            (2, 1, "C", "2026-10-20", True),
            (3, 0, "A", "2026-10-19", True),   # the earlier start wins...
            (3, 2, "E", "2026-10-21", True),
            (4, 0, "G", "2026-10-19", False),
        ])
        self.assertEqual(slots[1]["warnings"], ["Also in row 2; using the earliest start."])  # ...noted on it
        self.assertEqual(slots[0]["warnings"], [])

    def test_non_ucsb_email_is_dropped_with_a_warning(self):
        text = sheet(rider(**{"Email Address": "ana@gmail.com", "MONDAY Location #1 (Start to End)": "A to B",
                              "MONDAY #1": ["10/19/2026", "8:00:00 AM"]}))
        slot = self.preview(text).json()["slots"][0]
        self.assertEqual(slot["problems"], [])
        self.assertEqual(slot["warnings"], ["Not a UCSB email, left off: ana@gmail.com"])
        self.run_import([slot])
        self.assertEqual(Ride.objects.first().rider_email, "")

    def test_not_the_form(self):
        r = self.preview("Name,Thing\nA,B\n")
        self.assertEqual(r.status_code, 400)
        self.assertIn("doesn't look like", r.json()["error"])

    def test_dispatch_only(self):
        self.client.force_login(User.objects.create(username="x@ucsb.edu", email="x@ucsb.edu"))
        self.assertEqual(self.preview(sheet()).status_code, 403)


@override_settings(SERVICE_START="07:00", SERVICE_END="19:00")
class ExportTests(ImportApiTests.__bases__[0]):
    setUp = ImportApiTests.setUp
    preview = ImportApiTests.preview
    run_import = ImportApiTests.run_import

    def test_export_round_trips(self):
        text = sheet(rider(**{
            "MONDAY Location #1 (Start to End)": "Storke Tower to Library",
            "MONDAY #1": ["10/19/2026", "7:30:00 AM"],
            "MONDAY Location #2  (Start to End)": "Library to UCen",
            "MONDAY #2": ["10/19/2026", "12:00:00 PM"],
            "FRIDAY Location #1  (Start to End)": "UCen to Storke Tower",
            "FRIDAY #1": ["10/23/2026", "3:15:00 PM"],
        }))
        self.run_import(self.preview(text).json()["slots"])
        with at(TODAY, 9):
            r = self.client.get("/api/form-export/?week=2026-10-21")  # any day in the week
        self.assertEqual(r["X-Rides-Left-Out"], "0")
        rows = list(csv.reader(io.StringIO(r.content.decode())))
        self.assertEqual(rows[0], FORM_HEADERS)  # exactly the form's headers
        self.assertEqual(len(rows), 2)
        row = dict(zip(range(len(FORM_HEADERS)), rows[1]))
        col = {h: i for i, h in reversed(list(enumerate(FORM_HEADERS)))}  # first column of each name
        self.assertEqual(row[col["MONDAY Location #1 (Start to End)"]], "Storke Tower to Library")
        self.assertEqual(row[col["MONDAY #1"]], "10/19/2026")
        self.assertEqual(row[col["MONDAY #1"] + 1], "7:30:00 AM")
        self.assertEqual(row[col["MONDAY Location #2  (Start to End)"]], "Library to UCen")
        self.assertEqual(row[col["LOCK-IN (fill out below once and it will repeat)"]], LOCK_IN_ANSWER)
        # Equipment goes back in its own column, not repeated in every slot's notes.
        self.assertEqual(row[col["Do you have any mobility equipment? "]], "Crutches")
        self.assertEqual(row[col["MONDAY #1 NOTES"]], "")
        # Importing the export finds everything already scheduled.
        again = self.preview(r.content.decode()).json()["slots"]
        self.assertEqual(len(again), 3)
        self.assertTrue(all(s["new_rides"] == 0 and s["existing_rides"] > 0 for s in again))
        self.assertEqual(again[0]["notes"], "Mobility equipment: Crutches")


@override_settings(SERVICE_START="07:00", SERVICE_END="19:00")
class LockInTests(TestCase):
    setUp = ImportApiTests.setUp
    preview = ImportApiTests.preview
    run_import = ImportApiTests.run_import

    def test_without_the_lock_in_confirmation_it_is_one_ride_on_the_date(self):
        text = sheet(rider(**{
            "LOCK-IN (fill out below once and it will repeat)": "",
            "MONDAY Location #1 (Start to End)": "A to B", "MONDAY #1": ["10/19/2026", "8:00:00 AM"],
            "TUESDAY Location #1  (Start to End)": "A to B", "TUESDAY #1": ["10/6/2026", "8:00:00 AM"],  # passed
            "WEDNESDAY Location #1  (Start to End)": "A to B", "WEDNESDAY #1": ["", "8:00:00 AM"],  # no date
        }))
        slots = self.preview(text).json()["slots"]
        self.assertEqual([s["lock_in"] for s in slots], [False, False, False])
        self.assertEqual((slots[0]["new_rides"], slots[0]["problems"]), (1, []))
        self.assertEqual(slots[1]["problems"], ["10/6/2026 has already passed."])
        self.assertIn("No date entered", slots[2]["problems"][0])
        result = self.run_import(slots).json()
        self.assertEqual((result["rides"], result["series"]), (1, 0))
        ride = Ride.objects.get()
        self.assertIsNone(ride.series)
        self.assertEqual(ride.pickup_time, local(date(2026, 10, 19), 8))

    def test_lock_in_needs_the_checkbox(self):
        for answer, repeats in (
            (LOCK_IN_ANSWER, True),
            ("yes.  follow my exact class schedule ", True),  # spacing and case don't matter
            ("Yes", False),  # only the checkbox's own text counts
            ("No", False),
            ("", False),
        ):
            text = sheet(rider(**{"LOCK-IN (fill out below once and it will repeat)": answer,
                                  "MONDAY Location #1 (Start to End)": "A to B",
                                  "MONDAY #1": ["10/19/2026", "8:00:00 AM"]}))
            slot = self.preview(text).json()["slots"][0]
            self.assertEqual((slot["lock_in"], slot["new_rides"] > 1), (repeats, repeats), answer)

    def test_unreadable_time_shows_what_was_entered(self):
        text = sheet(rider(**{"MONDAY Location #1 (Start to End)": "A to B", "MONDAY #1": ["10/19/2026", "8ish"]}))
        self.assertEqual(self.preview(text).json()["slots"][0]["problems"], ['Could not parse: "8ish"'])
