import secrets

from django.db import models


def new_link_token():
    # ~22 URL-safe characters: unguessable, so the rider link needs no login.
    return secrets.token_urlsafe(16)


class Ride(models.Model):
    """One scheduled ride, entered by dispatch.

    Status isn't stored. It's worked out from started_at and the clock each
    time it's read (see rides/status.py), so rides complete "lazily" with no
    background jobs.
    """

    # Rider (validated by dispatch before entry; riders don't have accounts)
    rider_name = models.CharField(max_length=120)
    rider_phone = models.CharField(max_length=10, help_text="10 digits, e.g. 8055550123")
    rider_email = models.EmailField(blank=True)  # optional; "" when not given

    pickup_time = models.DateTimeField()

    # Anything the rider added when requesting the ride ("meet at the side
    # door"). Shown to dispatch and the ride's own driver only.
    notes = models.TextField(max_length=1000, blank=True)

    # Places, as names students recognize (entered by dispatch).
    pickup_name = models.CharField(max_length=120)
    dropoff_name = models.CharField(max_length=120)

    # Optional pins the rider drags onto the campus map on their ride page.
    # Stored as fractions of the image (0 = left/top, 1 = right/bottom), so
    # they land in the same spot at any display size.
    pickup_x = models.FloatField(null=True, blank=True)
    pickup_y = models.FloatField(null=True, blank=True)
    dropoff_x = models.FloatField(null=True, blank=True)
    dropoff_y = models.FloatField(null=True, blank=True)

    # Removing a driver leaves their rides unassigned.
    driver = models.ForeignKey(
        "accounts.Driver", null=True, blank=True, on_delete=models.SET_NULL, related_name="rides"
    )

    # Set when the driver starts the ride ("Start ride" / "Add to current"),
    # which puts it in their Current rides; its status becomes "on the way".
    started_at = models.DateTimeField(null=True, blank=True)
    # Set if the driver taps "Mark complete" (optional; otherwise the ride
    # completes on its own; see rides/status.py).
    completed_at = models.DateTimeField(null=True, blank=True)
    # Set by the rider's 👍 ("I'll be there") on their ride page.
    rider_confirmed_at = models.DateTimeField(null=True, blank=True)

    link_token = models.CharField(max_length=32, unique=True, default=new_link_token, editable=False)

    # Rides created together by "Repeat" share this id (see rides/recurrence.py).
    series = models.UUIDField(null=True, blank=True, db_index=True, editable=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["pickup_time"]
        indexes = [
            models.Index(fields=["pickup_time"]),
            models.Index(fields=["driver", "pickup_time"]),
            models.Index(fields=["rider_phone"]),
        ]

    def __str__(self):
        return f"{self.rider_name} · {self.pickup_name} → {self.dropoff_name}"


class DriverLocation(models.Model):
    """A driver's latest GPS fix, sent by their phone while a ride is on the way.

    Only the most recent position is kept (one row per driver, overwritten).
    It's only ever shown while the driver has a ride on the way; see
    rides/tracking.py.
    """

    driver = models.OneToOneField("accounts.Driver", on_delete=models.CASCADE, related_name="location")
    lat = models.FloatField()
    lng = models.FloatField()
    accuracy_m = models.FloatField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.driver} @ {self.lat:.5f}, {self.lng:.5f}"
