from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from accounts.models import Driver
from accounts.validators import normalize_email, validate_rider_email
from common import service_hours
from common.phone import normalize_phone

from .models import Ride
from .recurrence import MAX_SPAN_DAYS, repeat_dates



def django_to_drf(func, value):
    try:
        return func(value)
    except DjangoValidationError as err:
        raise serializers.ValidationError(err.messages)


def pin(x, y):
    """{"x": 0.42, "y": 0.61}, or None if the rider hasn't placed it."""
    return {"x": x, "y": y} if x is not None and y is not None else None


class RepeatSerializer(serializers.Serializer):
    """{"days": [0, 2], "until": "2026-12-04"}: Mondays and Wednesdays until Dec 4."""

    days = serializers.ListField(child=serializers.IntegerField(min_value=0, max_value=6), allow_empty=False)
    until = serializers.DateField()


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

    # Only when adding: repeat this ride on these weekdays until a date.
    repeat = RepeatSerializer(write_only=True, required=False, allow_null=True)

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
            "notes",
            "pickup_pin",
            "dropoff_pin",
            "driver",
            "driver_name",
            "driver_color",
            "status",
            "rider_confirmed",
            "started_at",
            "completed_at",
            "link_token",
            "series",
            "repeat",
        ]
        read_only_fields = ["link_token", "started_at", "completed_at", "series"]

    # Ride progress and notes are private: only dispatch and the ride's own
    # driver see them. (Notes may say what help the rider needs.)
    PRIVATE_FIELDS = ("status", "rider_confirmed", "started_at", "completed_at", "notes")

    def to_representation(self, ride):
        data = super().to_representation(ride)
        viewer = self.context.get("viewer")  # None = trusted caller (e.g. archive, admin tools)
        if viewer is not None and not viewer["is_admin"] and ride.driver_id != viewer["driver_id"]:
            for field in self.PRIVATE_FIELDS:
                data[field] = None
        return data

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
        if email:  # optional, but if given it must be a UCSB address
            django_to_drf(validate_rider_email, email)
        return email

    def validate_notes(self, value):
        return value.strip()  # optional

    def validate_pickup_name(self, value):
        return self._place_name(value, "pickup")

    def validate_dropoff_name(self, value):
        return self._place_name(value, "drop-off")

    def _place_name(self, value, which):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(f"Enter the {which} location name.")
        return value

    def validate(self, attrs):
        repeat = attrs.get("repeat")
        if repeat is not None:
            if self.instance is not None:
                raise serializers.ValidationError({"repeat": "Repeat can only be set when adding a ride."})
            if "pickup_time" not in attrs:
                raise serializers.ValidationError({"pickup_time": "Enter a date and time."})
            start = timezone.localtime(attrs["pickup_time"]).date()
            until = repeat["until"]
            if until < start:
                raise serializers.ValidationError({"repeat": "The last day can't be before the first ride."})
            if (until - start).days > MAX_SPAN_DAYS:
                raise serializers.ValidationError({"repeat": f"Repeat for at most {MAX_SPAN_DAYS} days."})
            repeat["dates"] = repeat_dates(start, set(repeat["days"]), until)
            if not repeat["dates"]:
                raise serializers.ValidationError({"repeat": "None of the chosen days fall in that range."})
        return attrs

    def validate_pickup_time(self, value):
        local = timezone.localtime(value)
        if not (service_hours.start() <= local.time() <= service_hours.end()):
            raise serializers.ValidationError(service_hours.window_message())
        # Only new times are checked against today, so an old ride can still
        # be edited (e.g. reassigned) without tripping this.
        unchanged = self.instance is not None and self.instance.pickup_time == value
        if not unchanged and local.date() < timezone.localdate():
            raise serializers.ValidationError("That date has already passed.")
        return value
