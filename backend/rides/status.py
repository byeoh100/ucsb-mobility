"""A ride's status, worked out from what happened instead of stored.

    not_confirmed  driver hasn't tapped "On the way" yet
    on_the_way     driver tapped it
    completed      the driver tapped "Mark complete", OR 15 minutes past pickup
                   time, OR the same driver has since started another ride

Computing it on read means rides complete on their own ("lazily"), with no
scheduled job flipping statuses.
"""

from collections import defaultdict
from datetime import timedelta

NOT_CONFIRMED = "not_confirmed"
ON_THE_WAY = "on_the_way"
COMPLETED = "completed"

# The rider link is live from 15 min before pickup to 15 min after.
LINK_WINDOW = timedelta(minutes=15)


def status_of(ride, now, driver_started_later):
    if ride.completed_at:
        return COMPLETED
    if now >= ride.pickup_time + LINK_WINDOW:
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
