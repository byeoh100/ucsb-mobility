from datetime import time

from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from accounts.models import Driver
from accounts.validators import normalize_email, validate_rider_email
from common.phone import normalize_phone

from .models import Ride

# Drivers work 8am–10pm; entries outside that are rejected.
EARLIEST = time(8, 0)
LATEST = time(22, 0)


def django_to_drf(func, value):
    try:
        return func(value)
    except DjangoValidationError as err:
        raise serializers.ValidationError(err.messages)


def pin(x, y):
    """{"x": 0.42, "y": 0.61}, or None if the rider hasn't placed it."""
    return {"x": x, "y": y} if x is not None and y is not None else None


class RideSerializer(serializers.ModelSerializer):
    # Writes take a driver id (or null); reads add the name and color.
    driver = serializers.PrimaryKeyRelatedField(queryset=Driver.objects.all(), allow_null=True, required=False)
    driver_name = serializers.CharField(source="driver.name", read_only=True, default=None)
    driver_color = serializers.CharField(source="driver.color", read_only=True, default=None)

    # Declared so any typed format reaches validate_rider_phone, which cleans
    # it to 10 digits (the model's 10-character limit would reject it first).
    rider_phone = serializers.CharField()

    # Pins are set by the rider on their ride page, so dispatch only reads them.
    pickup_pin = serializers.SerializerMethodField()
    dropoff_pin = serializers.SerializerMethodField()

    status = serializers.SerializerMethodField()
    rider_confirmed = serializers.SerializerMethodField()

    class Meta:
        model = Ride
        fields = [
            "id",
            "rider_name",
            "rider_phone",
            "rider_email",
            "pickup_time",
            "pickup_name",
            "dropoff_name",
            "pickup_pin",
            "dropoff_pin",
            "driver",
            "driver_name",
            "driver_color",
            "status",
            "rider_confirmed",
            "started_at",
            "link_token",
        ]
        read_only_fields = ["link_token", "started_at"]

    # --- read-only computed fields ---

    def get_status(self, ride):
        # The view computes all statuses in one pass and passes them in.
        return self.context.get("statuses", {}).get(ride.id)

    def get_pickup_pin(self, ride):
        return pin(ride.pickup_x, ride.pickup_y)

    def get_dropoff_pin(self, ride):
        return pin(ride.dropoff_x, ride.dropoff_y)

    def get_rider_confirmed(self, ride):
        return ride.rider_confirmed_at is not None

    # --- validation ---

    def validate_rider_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter the rider's name.")
        return value

    def validate_rider_phone(self, value):
        return django_to_drf(normalize_phone, value)

    def validate_rider_email(self, value):
        email = normalize_email(value)
        django_to_drf(validate_rider_email, email)
        return email

    def validate_pickup_name(self, value):
        return self._place_name(value, "pickup")

    def validate_dropoff_name(self, value):
        return self._place_name(value, "drop-off")

    def _place_name(self, value, which):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(f"Enter the {which} location name.")
        return value

    def validate_pickup_time(self, value):
        local = timezone.localtime(value)
        if not (EARLIEST <= local.time() <= LATEST):
            raise serializers.ValidationError("Rides must be between 8:00 AM and 10:00 PM.")
        # Only new times are checked against today, so an old ride can still
        # be edited (e.g. reassigned) without tripping this.
        unchanged = self.instance is not None and self.instance.pickup_time == value
        if not unchanged and local.date() < timezone.localdate():
            raise serializers.ValidationError("That date has already passed.")
        return value
