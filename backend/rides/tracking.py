"""What a driver is doing right now: their current ride and where they are."""

from django.utils import timezone

from .geo import to_map
from .models import DriverLocation, Ride
from .status import ON_THE_WAY, statuses_for

# A location older than this is shown as "last seen" rather than live.
LIVE_SECONDS = 60


def current_rides(driver, now=None):
    """The driver's rides that are on the way (riders can share the cart),
    in the order the driver started them."""
    now = now or timezone.now()
    started = list(
        Ride.objects.filter(driver=driver, started_at__isnull=False, pickup_time__date=timezone.localdate(now))
    )
    statuses = statuses_for(started, now)
    return sorted((r for r in started if statuses[r.id] == ON_THE_WAY), key=lambda r: r.started_at)


def location_payload(driver, now=None):
    """Where the driver is, as a point on the campus map, or None.

    Only returned while they have a ride on the way. Raw GPS never leaves
    the server; viewers get a position on the map image.
    """
    now = now or timezone.now()
    if not current_rides(driver, now):
        return None
    location = DriverLocation.objects.filter(driver=driver).first()
    if location is None:
        return None
    age = (now - location.updated_at).total_seconds()
    return {
        **to_map(location.lat, location.lng),
        "updated_at": location.updated_at.isoformat(),
        "age_seconds": round(age),
        "live": age <= LIVE_SECONDS,
    }
