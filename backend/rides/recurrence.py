"""Repeating rides: one ride per chosen weekday, from a start date to an end date.

A series is just rides that share a `series` id. Each ride is a normal ride
with its own link, driver, and status, so nothing else in the app needs to
know about series. Dispatch can then edit or delete "this ride only" or
"this and later rides" (see RideViewSet.update / destroy).
"""

from datetime import datetime, timedelta
from uuid import uuid4

from django.db import transaction
from django.utils import timezone

# Longest a series can run: about a quarter, plus some slack.
MAX_SPAN_DAYS = 120


def repeat_dates(start, weekdays, until):
    """Every date from start to until (inclusive) whose weekday is chosen.

    Weekdays use Python's numbering: Monday = 0 ... Sunday = 6.
    """
    days = []
    day = start
    while day <= until:
        if day.weekday() in weekdays:
            days.append(day)
        day += timedelta(days=1)
    return days


# Fields copied to later rides when an edit applies to "this and later rides".
SHARED_FIELDS = ("rider_name", "rider_phone", "rider_email", "pickup_name", "dropoff_name", "notes", "driver")


def create_series(fields, dates):
    """Create one ride per date, at the same campus time, sharing a series id."""
    from .models import Ride

    at = timezone.localtime(fields["pickup_time"]).time()
    series = uuid4()
    with transaction.atomic():
        return [
            Ride.objects.create(
                **{**fields, "pickup_time": timezone.make_aware(datetime.combine(day, at)), "series": series}
            )
            for day in dates
        ]


def same_time_on(ride, new_pickup_time):
    """The ride's own date at new_pickup_time's campus time of day."""
    day = timezone.localtime(ride.pickup_time).date()
    return timezone.make_aware(datetime.combine(day, timezone.localtime(new_pickup_time).time()))
