"""Ride counts for the driver profile (dispatch only).

A ride counts once it's assigned to the driver and completed (rides/status.py):
marked complete, or past RIDE_CUTOFF after pickup. For now that includes
no-shows, since a ride nobody started still completes on its own. One booking
is one ride, however many passengers it carried.

    week   rides this week, Monday through Sunday (campus time)
    total  all time: Driver.purged_rides (rides whose records the archive
           purge has deleted) plus the rides still in the database
"""

from datetime import datetime, time, timedelta

from django.db.models import Count, Q
from django.utils import timezone

from .status import RIDE_CUTOFF


def completed_q(now, prefix=""):
    """Q for completed rides; `prefix` reaches them through a relation ("rides__")."""
    return Q(**{f"{prefix}completed_at__isnull": False}) | Q(**{f"{prefix}pickup_time__lte": now - RIDE_CUTOFF})


def counted(rides, now=None):
    return rides.filter(completed_q(now or timezone.now()))


def week_bounds(now=None):
    """[Monday 00:00, next Monday 00:00) of this campus week, as aware datetimes."""
    today = timezone.localtime(now or timezone.now()).date()
    monday = today - timedelta(days=today.weekday())
    start = timezone.make_aware(datetime.combine(monday, time.min))
    return start, timezone.make_aware(datetime.combine(monday + timedelta(days=7), time.min))


def with_ride_counts(drivers, now=None):
    """Annotate a Driver queryset with rides_week and rides_kept (one query)."""
    now = now or timezone.now()
    start, end = week_bounds(now)
    done = completed_q(now, "rides__")
    return drivers.annotate(
        rides_kept=Count("rides", filter=done),
        rides_week=Count("rides", filter=done & Q(rides__pickup_time__gte=start, rides__pickup_time__lt=end)),
    )


def ride_counts(driver, now=None):
    """{"week", "total"}, from the annotations above when present."""
    if not hasattr(driver, "rides_kept"):
        start, end = week_bounds(now)
        mine = counted(driver.rides.all(), now)
        driver.rides_kept = mine.count()
        driver.rides_week = mine.filter(pickup_time__gte=start, pickup_time__lt=end).count()
    return {"week": driver.rides_week, "total": driver.purged_rides + driver.rides_kept}
