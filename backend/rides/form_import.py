"""Importing ride requests from the Google Form, and exporting rides back to it.

The form ("UCSB Campus Ride Scheduling") gives one row per response:

    First and Last Name: | Timestamp | Email Address | Phone Number: |
    Do you have any mobility equipment? |
    for each weekday and slot (Mon-Fri #1-#4, Mon-Thu #5):
        "<DAY> Location #N (Start to End)"   e.g. "Storke Tower to Library"
        "<DAY> #N", "<DAY> #N"                a date (9/29/2026) and a time
                                              (7:30:00 AM), in either order
        "<DAY> #N NOTES"
    LOCK-IN (fill out below once and it will repeat) | FLEX (fill out weekly)

Columns are found by name, not position: spacing and "# 1" vs "#1" don't
matter, and the #5 columns (added later, in another order) work the same.

A response with the LOCK-IN checkbox ticked ("Yes. Follow my exact class
schedule") repeats: every filled slot becomes a weekly ride on that
weekday, from the slot's date (or today, if that's later) until the "repeat
until" date picked when importing. Any other response is one ride per slot,
on the slot's date. Re-importing the same sheet is
safe: rides that already exist (same phone number, same pickup time) are
skipped. Riders often send the form again to add rides, so every response counts;
a weekly ride that appears in several responses is kept once, from its
earliest start date.
"""

import csv
import io
import re
from datetime import date, datetime, time, timedelta

from django.core.exceptions import ValidationError
from django.utils import timezone

from accounts.validators import normalize_email, validate_rider_email
from common import service_hours
from common.phone import normalize_phone

from .recurrence import MAX_SPAN_DAYS, create_series, repeat_dates

DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
LOCK_IN_ANSWER = "Yes. Follow my exact class schedule"
NO_EQUIPMENT = {"", "no", "none", "n/a", "na", "nope", "no.", "-"}

FORM_HEADERS = [
    'First and Last Name:',
    'Timestamp',
    'Email Address',
    'Phone Number:',
    'Do you have any mobility equipment? ',
    'MONDAY Location #1 (Start to End)',
    'MONDAY #1',
    'MONDAY #1',
    'MONDAY #1 NOTES',
    'MONDAY Location #2  (Start to End)',
    'MONDAY #2',
    'MONDAY #2',
    'MONDAY #2 NOTES',
    'MONDAY Location #3  (Start to End)',
    'MONDAY #3',
    'MONDAY #3',
    'MONDAY #3 NOTES',
    'MONDAY Location #4  (Start to End)',
    'MONDAY #4',
    'MONDAY #4',
    'MONDAY #4 NOTES',
    'TUESDAY Location #1  (Start to End)',
    'TUESDAY #1',
    'TUESDAY #1',
    'TUESDAY #1 NOTES',
    'TUESDAY Location #2  (Start to End)',
    'TUESDAY #2',
    'TUESDAY  #2',
    'TUESDAY #2 NOTES',
    'TUESDAY Location #3  (Start to End)',
    'TUESDAY #3',
    'TUESDAY #3',
    'TUESDAY #3 NOTES',
    'TUESDAY Location #4  (Start to End)',
    'TUESDAY #4',
    'TUESDAY #4',
    'TUESDAY #4 NOTES',
    'WEDNESDAY Location #1  (Start to End)',
    'WEDNESDAY #1',
    'WEDNESDAY #1',
    'WEDNESDAY #1 NOTES',
    'WEDNESDAY Location #2  (Start to End)',
    'WEDNESDAY #2',
    'WEDNESDAY #2',
    'WEDNESDAY #2 NOTES',
    'WEDNESDAY Location #3  (Start to End)',
    'WEDNESDAY #3',
    'WEDNESDAY #3',
    'WEDNESDAY #3 NOTES',
    'WEDNESDAY Location #4  (Start to End)',
    'WEDNESDAY #4',
    'WEDNESDAY #4',
    'WEDNESDAY #4 NOTES',
    'THURSDAY Location #1  (Start to End)',
    'THURSDAY #1',
    'THURSDAY #1',
    'THURSDAY #1 NOTES',
    'THURSDAY Location #2  (Start to End)',
    'THURSDAY #2',
    'THURSDAY #2',
    'THURSDAY #2 NOTES',
    'THURSDAY Location #3  (Start to End)',
    'THURSDAY #3',
    'THURSDAY #3',
    'THURSDAY #3 NOTES',
    'THURSDAY Location #4  (Start to End)',
    'THURSDAY #4',
    'THURSDAY #4',
    'THURSDAY #4 NOTES',
    'FRIDAY Location #1  (Start to End)',
    'FRIDAY #1',
    'FRIDAY #1',
    'FRIDAY # 1 NOTES',
    'FRIDAY Location #2  (Start to End)',
    'FRIDAY #2',
    'FRIDAY #2',
    'FRIDAY #2 NOTES',
    'FRIDAY Location #3  (Start to End)',
    'FRIDAY #3',
    'FRIDAY #3',
    'FRIDAY # 3 NOTES',
    'FRIDAY Location #4  (Start to End)',
    'FRIDAY #4',
    'FRIDAY #4',
    'FRIDAY #4 NOTES',
    'LOCK-IN (fill out below once and it will repeat)',
    'FLEX (fill out weekly)',
    'MONDAY #5',
    'MONDAY #5',
    'MONDAY Location #5 (Start to End)',
    'MONDAY #5 NOTES',
    'TUESDAY #5 ',
    'TUESDAY #5',
    'TUESDAY Location #5 (Start to End)',
    'TUESDAY #5 NOTES',
    'WEDNESDAY #5',
    'WEDNESDAY #5',
    'WEDNESDAY Location #5 ',
    'WEDNESDAY #5 NOTES',
    'THURSDAY #5',
    'THURSDAY #5',
    'THURSDAY Location #5 (Start to End)',
    'THURSDAY #5 NOTES',
]


class FormError(ValueError):
    """The file isn't the form's responses (or can't be read)."""


def _norm(header):
    """'FRIDAY # 1 NOTES ' → 'FRIDAY #1 NOTES'; 'TUESDAY  #2' → 'TUESDAY #2'."""
    text = re.sub(r"\s+", " ", (header or "").replace("﻿", "")).strip().upper()
    return re.sub(r"#\s+", "#", text)


SLOT_LOCATION = re.compile(r"^(%s) LOCATION #(\d+)\b" % "|".join(DAYS))
SLOT_NOTES = re.compile(r"^(%s) #(\d+) NOTES$" % "|".join(DAYS))
SLOT_VALUE = re.compile(r"^(%s) #(\d+)$" % "|".join(DAYS))


def read_layout(header):
    """Which column holds what: {"name": i, "phone": i, ..., "slots": {(weekday, n): {...}}}.
    Each slot has "location", "notes" (column or None) and "values" (its date and
    time columns, in sheet order)."""
    layout = {"slots": {}}
    for i, raw in enumerate(header):
        h = _norm(raw)
        if m := SLOT_LOCATION.match(h):
            layout["slots"].setdefault((DAYS.index(m[1]), int(m[2])), {"values": []})["location"] = i
        elif m := SLOT_NOTES.match(h):
            layout["slots"].setdefault((DAYS.index(m[1]), int(m[2])), {"values": []})["notes"] = i
        elif m := SLOT_VALUE.match(h):
            layout["slots"].setdefault((DAYS.index(m[1]), int(m[2])), {"values": []})["values"].append(i)
        elif h.startswith("FIRST AND LAST NAME") or h in ("NAME", "NAME:", "FULL NAME"):
            layout.setdefault("name", i)
        elif h.startswith("TIMESTAMP"):
            layout.setdefault("timestamp", i)
        elif h.startswith("EMAIL"):
            layout.setdefault("email", i)
        elif h.startswith("PHONE"):
            layout.setdefault("phone", i)
        elif "MOBILITY EQUIPMENT" in h:
            layout.setdefault("mobility", i)
        elif h.startswith("LOCK-IN") or h.startswith("LOCK IN"):
            layout.setdefault("lock_in", i)
        elif h.startswith("FLEX"):
            layout.setdefault("flex", i)
    missing = [label for key, label in (("name", "First and Last Name"), ("phone", "Phone Number")) if key not in layout]
    if missing or not layout["slots"]:
        raise FormError(
            "This doesn't look like the ride form's responses"
            + (f" (no {' or '.join(missing)} column)." if missing else " (no day/location columns).")
        )
    return layout


# --- reading values ---------------------------------------------------------

DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$")
TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?$")
TIMESTAMP_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$")


def parse_date(text):
    m = DATE_RE.match((text or "").strip())
    if not m:
        return None
    try:
        return date(int(m[3]), int(m[1]), int(m[2]))
    except ValueError:
        return None


def parse_time(text):
    """'7:30:00 AM' / '7:30 AM' / '12:00:00 PM' → time, or None."""
    m = TIME_RE.match((text or "").strip())
    if not m:
        return None
    hour, minute = int(m[1]), int(m[2])
    if not (1 <= hour <= 12 and minute < 60):
        return None
    pm = m[4].lower() == "p"
    return time((hour % 12) + (12 if pm else 0), minute)


def parse_timestamp(text):
    m = TIMESTAMP_RE.match((text or "").strip())
    if not m:
        return None
    try:
        hour = int(m[4])
        if m[7]:
            hour = hour % 12 + (12 if m[7].lower() == "pm" else 0)
        return datetime(int(m[3]), int(m[1]), int(m[2]), hour, int(m[5]), int(m[6] or 0))
    except ValueError:
        return None


# Ends of a place name: anything that isn't a letter or digit is trimmed off
# (so "Library ->" and "- Storke Tower" come out clean), except brackets
# that belong to the name.
_TRIM = re.compile(r"^[^0-9A-Za-z(]+|[^0-9A-Za-z)]+$")
_TO = re.compile(r"\s+to\s+", re.IGNORECASE)
_DASH = re.compile(r"-+>|→|–|—|-")


def split_route(text):
    """'Storke Tower to Library' or 'Storke Tower - Library' → ('Storke Tower', 'Library').
    None if it can't be split into two names."""
    text = (text or "").strip()
    parts = _TO.split(text, maxsplit=1)
    if len(parts) != 2:
        parts = _DASH.split(text, maxsplit=1)
    if len(parts) != 2:
        return None
    pickup, dropoff = (_TRIM.sub("", p.strip()) for p in parts)
    return (pickup, dropoff) if pickup and dropoff else None


def read_csv(text):
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    if not rows:
        raise FormError("That file is empty.")
    return rows[0], rows[1:]


# --- planning ---------------------------------------------------------------


def _squash(text):
    """Lowercase with single spaces, for comparing answers."""
    return re.sub(r"\s+", " ", text).strip().lower()


def _cell(row, i):
    return row[i].strip() if i is not None and i < len(row) else ""


def plan_slot(slot, until, today=None):
    """Check one slot and work out its rides. Returns (fields, dates, problems,
    warnings): fields for create_series (pickup_time on the first date), the
    dates it repeats on, and what's wrong (problems block importing it)."""
    today = today or timezone.localdate()
    problems, warnings = [], []

    name = (slot.get("rider_name") or "").strip()
    if not name:
        problems.append("No name.")
    try:
        phone = normalize_phone(slot.get("rider_phone") or "")
    except ValidationError:
        phone = ""
        problems.append("Phone number isn't 10 digits.")
    email = normalize_email(slot.get("rider_email"))
    if email:
        try:
            validate_rider_email(email)
        except ValidationError:
            warnings.append(f"Not a UCSB email, left off: {email}")
            email = ""

    pickup = (slot.get("pickup") or "").strip()
    dropoff = (slot.get("dropoff") or "").strip()
    if not pickup or not dropoff:
        problems.append(location_problem(slot))
    elif len(pickup) > 120 or len(dropoff) > 120:
        problems.append("A location name is too long (120 characters at most).")

    at = parse_time(slot.get("time") or "") if slot.get("time") else None
    if at is None:
        problems.append("No time entered." if not slot.get("time") else f'Could not parse: "{slot["time"]}"')
    elif not (service_hours.start() <= at <= service_hours.end()):
        problems.append(f"{at.hour % 12 or 12}:{at.minute:02d} {'AM' if at.hour < 12 else 'PM'} is outside hours of operation.")

    weekday = slot["weekday"]
    given = date.fromisoformat(slot["first_date"]) if slot.get("first_date") else None
    if slot.get("bad_date"):
        problems.append(f'Could not parse: "{slot["bad_date"]}"')
    if slot.get("also_in_rows"):
        rows = ", ".join(str(r) for r in slot["also_in_rows"])
        warnings.append(f"Also in row{'s' if len(slot['also_in_rows']) > 1 else ''} {rows}; using the earliest start.")
    if slot.get("lock_in"):
        # LOCK-IN: weekly on this weekday, from the given date (or today).
        if given and given.weekday() != weekday:
            warnings.append(f"{_date_text(given)} is a {given:%A}; it repeats on {DAYS[weekday].title()}s.")
        if until > today + timedelta(days=MAX_SPAN_DAYS):
            problems.append(f"Repeat for at most {MAX_SPAN_DAYS} days.")
        dates = repeat_dates(max(given or today, today), {weekday}, until)
        if not dates and not problems:
            problems.append("No rides between its start and the repeat-until date.")
    else:
        # Not LOCK-IN: one ride, on the date given.
        dates = []
        if given is None and not slot.get("bad_date"):
            problems.append("No date entered (and not LOCK-IN, so it doesn't repeat).")
        elif given and given < today:
            problems.append(f"{_date_text(given)} has already passed.")
        elif given:
            dates = [given]
            if given.weekday() != weekday:
                warnings.append(f"{_date_text(given)} is a {given:%A}, not a {DAYS[weekday].title()}.")

    notes = (slot.get("notes") or "").strip()[:1000]
    fields = None
    if not problems:
        fields = {
            "rider_name": name, "rider_phone": phone, "rider_email": email,
            "pickup_name": pickup, "dropoff_name": dropoff, "notes": notes,
            "pickup_time": timezone.make_aware(datetime.combine(dates[0], at)),
        }
    return fields, dates, problems, warnings


def location_problem(slot):
    """What the preview says when a location couldn't be split in two."""
    text = (slot.get("location") or "").strip()
    return f'Could not parse: "{text}"' if text else "No location entered."


def _existing(phone, dates, at):
    """Which of these dates already have a ride for this phone at this time."""
    from .models import Ride

    times = [timezone.make_aware(datetime.combine(d, at)) for d in dates]
    taken = set(Ride.objects.filter(rider_phone=phone, pickup_time__in=times).values_list("pickup_time", flat=True))
    return [d for d, t in zip(dates, times) if t in taken]


def slots_from_csv(text):
    """Every filled slot in the sheet, as dicts the preview shows and edits.

    Riders often send the form again to add rides, so every response counts.
    The one exception: the same weekly LOCK-IN ride (same phone number,
    weekday and time) in several responses is kept once, from the earliest
    start date given; the preview notes the other rows it was in."""
    header, rows = read_csv(text)
    layout = read_layout(header)

    slots = []
    for n, row in enumerate(rows, start=2):  # sheet row numbers (row 1 = headers)
        if not any(c.strip() for c in row):
            continue
        mobility = _cell(row, layout.get("mobility"))
        # LOCK-IN is a checkbox; ticked, the cell holds its one option's text.
        # (Checkbox cells list every ticked option, comma-separated.)
        lock_in = _squash(LOCK_IN_ANSWER) in _squash(_cell(row, layout.get("lock_in")))
        for (weekday, number), cols in sorted(layout["slots"].items()):
            location = _cell(row, cols.get("location"))
            values = [_cell(row, i) for i in cols["values"]]
            if not location and not any(values):
                continue
            first_date = bad_date = at = None
            for v in values:
                if not v:
                    continue
                if (d := parse_date(v)) is not None:
                    first_date = d
                elif parse_time(v) is not None:
                    at = v
                elif "/" in v:
                    bad_date = v
                else:
                    at = v  # shown as unreadable by plan_slot
            route = split_route(location)
            notes = [MOBILITY_PREFIX + mobility] if mobility.lower() not in NO_EQUIPMENT else []
            if slot_notes := _cell(row, cols.get("notes")):
                notes.append(slot_notes)
            slots.append({
                "key": f"{n}-{weekday}-{number}",
                "row": n,
                "rider_name": _cell(row, layout["name"]),
                "rider_phone": _cell(row, layout["phone"]),
                "rider_email": _cell(row, layout.get("email")),
                "weekday": weekday,
                "slot": number,
                "location": location,
                "pickup": route[0] if route else "",
                "dropoff": route[1] if route else "",
                "time": at,
                "first_date": first_date.isoformat() if first_date else None,
                "bad_date": bad_date,
                "lock_in": lock_in,
                "notes": "\n".join(notes),
            })
    return _merge_repeats(slots)


def _merge_repeats(slots):
    """Keep one of each weekly LOCK-IN ride (phone, weekday, time): the one
    starting earliest. One-off rides are all kept."""
    today = timezone.localdate()
    kept, by_key = [], {}
    for slot in slots:
        at = parse_time(slot["time"] or "")
        phone = re.sub(r"\D", "", slot["rider_phone"])[-10:]
        if not (slot["lock_in"] and at and len(phone) == 10):
            kept.append(slot)
            continue
        key = (phone, slot["weekday"], at)
        start = lambda s: max(date.fromisoformat(s["first_date"]) if s["first_date"] else today, today)
        if key not in by_key:
            slot["also_in_rows"] = []
            by_key[key] = slot
            kept.append(slot)
            continue
        first = by_key[key]
        if start(slot) < start(first):
            # This response starts it sooner: it replaces the one kept so far.
            slot["also_in_rows"] = sorted(first["also_in_rows"] + [first["row"]])
            kept[kept.index(first)] = slot
            by_key[key] = slot
        else:
            first["also_in_rows"] = sorted(first["also_in_rows"] + [slot["row"]])
    # Sheet order, so each response's rides stay together in the preview.
    return sorted(kept, key=lambda s: (s["row"], s["weekday"], s["slot"]))


def check(slot, until, today=None):
    """The slot with what the preview shows: rides it adds, ones already there,
    problems and warnings."""
    fields, dates, problems, warnings = plan_slot(slot, until, today)
    existing = _existing(fields["rider_phone"], dates, timezone.localtime(fields["pickup_time"]).time()) if fields else []
    return {
        **slot,
        "problems": problems,
        "location_problem": location_problem(slot) if location_problem(slot) in problems else None,
        "warnings": warnings,
        "starts": dates[0].isoformat() if dates else None,
        "new_rides": len(dates) - len(existing),
        "existing_rides": len(existing),
    }


def import_slots(slots, until, today=None):
    """Create the rides for these slots (a series for each LOCK-IN slot, a
    single ride otherwise), skipping rides that already exist.
    Returns {"rides": n, "series": n, "skipped": [{key, reason}]}."""
    from .models import Ride

    created = series = 0
    skipped = []
    for slot in slots:
        fields, dates, problems, _ = plan_slot(slot, until, today)
        if problems:
            skipped.append({"key": slot.get("key"), "reason": problems[0]})
            continue
        at = timezone.localtime(fields["pickup_time"]).time()
        taken = set(_existing(fields["rider_phone"], dates, at))
        todo = [d for d in dates if d not in taken]
        if not todo:
            skipped.append({"key": slot.get("key"), "reason": "Already scheduled."})
            continue
        fields["pickup_time"] = timezone.make_aware(datetime.combine(todo[0], at))
        if slot.get("lock_in"):
            created += len(create_series(fields, todo))
            series += 1
        else:
            Ride.objects.create(**fields)
            created += 1
    return {"rides": created, "series": series, "skipped": skipped}


# --- export -----------------------------------------------------------------


def _date_text(d):
    return f"{d.month}/{d.day}/{d.year}"


def _time_text(t):
    return f"{t.hour % 12 or 12}:{t.minute:02d}:00 {'AM' if t.hour < 12 else 'PM'}"


MOBILITY_PREFIX = "Mobility equipment: "


def _split_mobility(notes):
    """('Crutches', 'Meet at the bike racks') from the notes an import wrote."""
    first, _, rest = (notes or "").partition("\n")
    if first.startswith(MOBILITY_PREFIX):
        return first[len(MOBILITY_PREFIX):].strip(), rest.strip()
    return "", (notes or "").strip()


def export_week(monday):
    """The week's rides (Monday to Friday) as the form's response sheet: one
    row per rider, their rides in the day slots in time order. Returns
    (csv_text, rides_left_out) — a day has at most 4 or 5 slots."""
    from .models import Ride

    layout = read_layout(FORM_HEADERS)
    rides = (
        Ride.objects.filter(pickup_time__date__gte=monday, pickup_time__date__lte=monday + timedelta(days=4))
        .order_by("pickup_time")
    )
    by_rider = {}
    for ride in rides:
        by_rider.setdefault(ride.rider_phone, []).append(ride)

    now = timezone.localtime()
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(FORM_HEADERS)
    left_out = 0
    for phone, mine in sorted(by_rider.items(), key=lambda item: item[1][0].rider_name.lower()):
        row = [""] * len(FORM_HEADERS)
        first = mine[0]
        row[layout["name"]] = first.rider_name
        if "timestamp" in layout:
            row[layout["timestamp"]] = f"{_date_text(now.date())} {now:%H:%M:%S}"
        if "email" in layout:
            row[layout["email"]] = next((r.rider_email for r in mine if r.rider_email), "")
        row[layout["phone"]] = f"{phone[:3]}-{phone[3:6]}-{phone[6:]}"
        mobility = next((m for m in (_split_mobility(r.notes)[0] for r in mine) if m), "")
        if "mobility" in layout and mobility:
            row[layout["mobility"]] = mobility
        if "lock_in" in layout and any(r.series for r in mine):
            row[layout["lock_in"]] = LOCK_IN_ANSWER
        for weekday in range(5):
            day_rides = [r for r in mine if timezone.localtime(r.pickup_time).weekday() == weekday]
            numbers = sorted(n for (w, n) in layout["slots"] if w == weekday)
            left_out += max(0, len(day_rides) - len(numbers))
            for ride, number in zip(day_rides, numbers):
                cols = layout["slots"][(weekday, number)]
                local = timezone.localtime(ride.pickup_time)
                if "location" in cols:
                    row[cols["location"]] = f"{ride.pickup_name} to {ride.dropoff_name}"
                values = cols["values"]
                if values:
                    row[values[0]] = _date_text(local.date())
                if len(values) > 1:
                    row[values[1]] = _time_text(local.time())
                if cols.get("notes") is not None:
                    row[cols["notes"]] = _split_mobility(ride.notes)[1]  # equipment has its own column
        writer.writerow(row)
    return out.getvalue(), left_out
