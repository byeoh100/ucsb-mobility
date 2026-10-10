"""Ride counts for the driver modal and the Metrics page (dispatch only).

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



def range_stats(first_day, last_day, now=None):
    """Everything the Metrics page shows for campus dates first_day through
    last_day (inclusive), from the counted rides with pickups in that range.

        total      rides
        drivers    [{id, name, color, rides}], most rides first (none = left out)
        by_day     [{date, rides}] for every date in the range, zeros included
        by_hour    [{hour, rides}] for each hour of operation (pickup time)
        top_place  {name, rides}: the place most rides start or end at, or None
        riders     different riders, by phone number (for rides per rider)
        weekdays   Mon-Fri dates in the range up to today, for averages

    Rides older than the archive's retention have been deleted, so ranges
    reaching further back than that only see what's left (their totals live
    on in Driver.purged_rides, which has no dates)."""
    from common import service_hours

    from .models import Ride

    now = now or timezone.now()
    today = timezone.localtime(now).date()
    rides = (
        counted(Ride.objects.filter(driver__isnull=False), now)
        .filter(pickup_time__date__gte=first_day, pickup_time__date__lte=last_day)
        .select_related("driver")
        .only("pickup_time", "rider_phone", "pickup_name", "dropoff_name", "driver__name", "driver__color")
    )

    days = {}
    day = first_day
    while day <= last_day:
        days[day] = 0
        day += timedelta(days=1)
    open_hour = service_hours.start().hour
    close = service_hours.end()
    hours = {h: 0 for h in range(open_hour, close.hour + (1 if close.minute else 0))}
    last_hour = max(hours)  # a pickup right at closing (7:00 PM) goes in the last bar
    drivers = {}
    places = {}  # lowercased name → {spelling: count}, so "Library" and "library" are one place
    phones = set()

    for ride in rides:
        local = timezone.localtime(ride.pickup_time)
        days[local.date()] = days.get(local.date(), 0) + 1
        if local.hour >= open_hour:
            hours[min(local.hour, last_hour)] += 1
        d = drivers.setdefault(ride.driver_id, {"id": ride.driver_id, "name": ride.driver.name, "color": ride.driver.color, "rides": 0})
        d["rides"] += 1
        for name in {ride.pickup_name.strip(), ride.dropoff_name.strip()} - {""}:
            spellings = places.setdefault(name.lower(), {})
            spellings[name] = spellings.get(name, 0) + 1
        phones.add(ride.rider_phone)

    top_place = None
    if places:
        # Most rides wins; ties go alphabetically, so the answer doesn't flicker.
        key = min(places, key=lambda k: (-sum(places[k].values()), k))
        spellings = places[key]
        top_place = {"name": max(spellings, key=spellings.get), "rides": sum(spellings.values())}

    return {
        "from": first_day.isoformat(),
        "to": last_day.isoformat(),
        "total": sum(d["rides"] for d in drivers.values()),
        "drivers": sorted(drivers.values(), key=lambda d: (-d["rides"], d["name"])),
        "by_day": [{"date": d.isoformat(), "rides": n} for d, n in sorted(days.items())],
        "by_hour": [{"hour": h, "rides": n} for h, n in hours.items()],
        "top_place": top_place,
        "riders": len(phones),
        "weekdays": sum(1 for d in days if d.weekday() < 5 and d <= today),
    }
