"""The rider's page for one ride (/r/<token>): no login, the token is the key.

Phases, by the clock and the ride's status:

    upcoming   more than 20 min before pickup: details, pin dragging
    live       from 20 min before pickup until the ride is over (a late
               pickup stays live, up to RIDE_CUTOFF): status, drop-offs away,
               driver's position, thumbs up
    complete   the ride is over: "your ride is complete"
    expired    the ride is over and it's 20+ min past pickup: nothing but
               "this link has expired"
"""

from django.conf import settings
from django.utils import timezone

from .models import Ride
from .serializers import pin
from .status import COMPLETED, LINK_WINDOW, ON_THE_WAY, status_of, statuses_for
from .tracking import location_payload

UPCOMING, LIVE, COMPLETE, EXPIRED = "upcoming", "live", "complete", "expired"


def phase_of(ride, now, status=None):
    status = status or status_of(ride, now)
    if status == COMPLETED:
        return EXPIRED if now >= ride.pickup_time + LINK_WINDOW else COMPLETE
    # Not over yet: live from 20 min before pickup for as long as the ride
    # runs, however late. (Also live if the driver set off extra early.)
    if now >= ride.pickup_time - LINK_WINDOW or status == ON_THE_WAY:
        return LIVE
    return UPCOMING


def dropoffs_away(ride, now):
    """How many of the driver's rides come before this one and aren't done:
    the one they're on now (if it isn't this one) plus earlier ones not started."""
    if not ride.driver_id:
        return None
    todays = list(
        Ride.objects.filter(driver_id=ride.driver_id, pickup_time__date=timezone.localtime(ride.pickup_time).date())
    )
    statuses = statuses_for(todays, now)
    return sum(
        1
        for r in todays
        if r.id != ride.id
        and statuses[r.id] != COMPLETED
        and (statuses[r.id] == ON_THE_WAY or r.pickup_time < ride.pickup_time)
    )


def page_payload(ride, now=None):
    now = now or timezone.now()
    status = status_of(ride, now)
    phase = phase_of(ride, now, status)
    payload = {"phase": phase, "dispatch_phone": settings.DISPATCH_PHONE}
    if phase == EXPIRED:
        return payload  # an old link reveals nothing

    payload["ride"] = {
        "pickup_time": timezone.localtime(ride.pickup_time).isoformat(),
        "pickup_name": ride.pickup_name,
        "dropoff_name": ride.dropoff_name,
        "pickup_pin": pin(ride.pickup_x, ride.pickup_y),
        "dropoff_pin": pin(ride.dropoff_x, ride.dropoff_y),
        "rider_confirmed": ride.rider_confirmed_at is not None,
        "tracking_starts_at": timezone.localtime(ride.pickup_time - LINK_WINDOW).isoformat(),
        "link_expires_at": timezone.localtime(ride.pickup_time + LINK_WINDOW).isoformat(),
    }
    if phase == LIVE:
        driver = ride.driver
        payload["live"] = {
            "status": status,
            "driver": {"name": driver.name.split()[0], "color": driver.color} if driver else None,
            "dropoffs_away": dropoffs_away(ride, now),
            # Where the driver is, while they're driving anyone (this rider or
            # an earlier one), as a point on the map. Never raw GPS.
            "driver_location": location_payload(driver, now) if driver else None,
        }
    return payload
