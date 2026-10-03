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


class RideSerializer(serializers.ModelSerializer):
    # Writes take a driver id (or null); reads add the name and color.
    driver = serializers.PrimaryKeyRelatedField(queryset=Driver.objects.all(), allow_null=True, required=False)
    driver_name = serializers.CharField(source="driver.name", read_only=True, default=None)
    driver_color = serializers.CharField(source="driver.color", read_only=True, default=None)

    # Declared so any typed format reaches validate_rider_phone, which cleans
    # it to 10 digits (the model's 10-character limit would reject it first).
    rider_phone = serializers.CharField()

    pickup_lat = serializers.FloatField(min_value=-90, max_value=90)
    pickup_lng = serializers.FloatField(min_value=-180, max_value=180)
    dropoff_lat = serializers.FloatField(min_value=-90, max_value=90)
    dropoff_lng = serializers.FloatField(min_value=-180, max_value=180)

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
            "pickup_lat",
            "pickup_lng",
            "dropoff_name",
            "dropoff_lat",
            "dropoff_lng",
            "driver",
            "driver_name",
            "driver_color",
            "status",
            "rider_confirmed",
            "link_token",
        ]
        read_only_fields = ["link_token"]

    # --- read-only computed fields ---

    def get_status(self, ride):
        # The view computes all statuses in one pass and passes them in.
        return self.context.get("statuses", {}).get(ride.id)

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
