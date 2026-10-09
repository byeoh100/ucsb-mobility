"""When rides move to the archive, and when they're deleted for good.

Like ride status, this is worked out from the clock rather than by a job:

  - A ride is archived once its day is over AND it's past 8:00 AM the next
    morning. (Before 8 AM, yesterday's rides are still on the main list.)
  - Archived rides are kept for ARCHIVE_RETENTION_DAYS (default 90), then
    deleted by purge_expired(), which the API calls as pages load.
  - Before rides are deleted, each driver's count of them is added to
    Driver.purged_rides, so all-time counts survive (rides/metrics.py).
  - Drivers' last GPS fix is deleted after a day by the same cleanup.
"""

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone

ARCHIVE_HOUR = 8  # local time the previous day's rides move to the archive


def archive_cutoff(now=None):
    """Rides on days before this date are archived.

    Shifting the clock back 8 hours makes the date roll over at 8 AM instead
    of midnight: at 7:59 AM it's still "yesterday", at 8:00 AM it's "today".
    """
    local = timezone.localtime(now or timezone.now())
    return (local - timedelta(hours=ARCHIVE_HOUR)).date()


def is_archived(ride, now=None):
    return timezone.localtime(ride.pickup_time).date() < archive_cutoff(now)


def purge_before(now=None):
    """Archived rides on days before this date are deleted."""
    return archive_cutoff(now) - timedelta(days=settings.ARCHIVE_RETENTION_DAYS)


# Drivers' last GPS fix is only useful during a ride; drop it after a day.
LOCATION_RETENTION = timedelta(days=1)


def purge_expired(now=None):
    """Delete rides past the retention window, and stale driver locations.
    Cheap: indexed DELETEs, run as pages load. Returns rides deleted."""
    from accounts.models import Driver

    from .metrics import counted
    from .models import DriverLocation, Ride

    now = now or timezone.now()
    expired = Ride.objects.filter(pickup_time__date__lt=purge_before(now))
    deleted = 0
    with transaction.atomic():
        # Each driver's rides are counted by what the DELETE itself removed,
        # so two page loads purging at once can't both count the same rides
        # (the second one's DELETE finds them already gone).
        driver_ids = expired.filter(driver__isnull=False).values_list("driver", flat=True).distinct()
        for driver_id in list(driver_ids):
            n, _ = counted(expired.filter(driver_id=driver_id), now).delete()
            if n:
                Driver.objects.filter(pk=driver_id).update(purged_rides=F("purged_rides") + n)
            deleted += n
        rest, _ = expired.delete()  # unassigned rides, and ones that never completed
        deleted += rest
    DriverLocation.objects.filter(updated_at__lt=now - LOCATION_RETENTION).delete()
    return deleted
