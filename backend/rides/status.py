"""A ride's status, worked out from what happened instead of stored.

    not_confirmed  driver hasn't tapped "On the way" yet
    on_the_way     driver tapped it
    completed      the driver tapped "Mark complete", OR the same driver has
                   since started another ride, OR RIDE_CUTOFF (60 min) past
                   pickup time, a safety net for rides nobody closed

Computing it on read means rides complete on their own ("lazily"), with no
scheduled job flipping statuses.
"""

from collections import defaultdict
from datetime import timedelta

NOT_CONFIRMED = "not_confirmed"
ON_THE_WAY = "on_the_way"
COMPLETED = "completed"

# The rider link goes live 20 min before pickup, and closes 20 min after
# pickup once the ride is over (see rider_page.py).
LINK_WINDOW = timedelta(minutes=20)

# A ride that's late or still under way stays open this long after pickup:
# a late driver can still tap "On the way", and the rider's link stays live.
# Past this, the ride counts as completed even if nobody closed it, so
# location sharing can't run on forever.
RIDE_CUTOFF = timedelta(minutes=60)


def status_of(ride, now, driver_started_later):
    if ride.completed_at:
        return COMPLETED
    if now >= ride.pickup_time + RIDE_CUTOFF:
        return COMPLETED
    if ride.started_at:
        return COMPLETED if driver_started_later else ON_THE_WAY
    return NOT_CONFIRMED


def statuses_for(rides, now, other_starts=()):
    """Status for each ride in one pass: {ride.id: status}.

    `other_starts` can add (driver_id, started_at) pairs for rides outside
    `rides` (e.g. a driver's ride on another day) so "started a later ride"
    still counts them.
    """
    starts = defaultdict(list)
    for ride in rides:
        if ride.driver_id and ride.started_at:
            starts[ride.driver_id].append(ride.started_at)
    for driver_id, started_at in other_starts:
        starts[driver_id].append(started_at)

    result = {}
    for ride in rides:
        later = bool(ride.started_at) and any(t > ride.started_at for t in starts.get(ride.driver_id, ()))
        result[ride.id] = status_of(ride, now, later)
    return result
