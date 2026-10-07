"""A ride's status, worked out from what happened instead of stored.

    not_confirmed  driver hasn't tapped "On the way" yet
    on_the_way     driver tapped it
    completed      the driver tapped "Mark complete", OR RIDE_CUTOFF (60 min)
                   past pickup time, a safety net for rides nobody closed

A driver can have several rides on the way at once (riders sharing the
cart), so starting one ride never ends another; each rider's ride ends when
the driver marks it complete.

Computing it on read means rides complete on their own ("lazily"), with no
scheduled job flipping statuses.
"""

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


def status_of(ride, now):
    if ride.completed_at:
        return COMPLETED
    if now >= ride.pickup_time + RIDE_CUTOFF:
        return COMPLETED
    if ride.started_at:
        return ON_THE_WAY
    return NOT_CONFIRMED


def statuses_for(rides, now):
    """Status for each ride: {ride.id: status}."""
    return {ride.id: status_of(ride, now) for ride in rides}
