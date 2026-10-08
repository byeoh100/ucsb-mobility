from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from common.phone import normalize_phone

from common import service_hours

from .models import DRIVER_COLORS, AdminEmail, Driver, DriverShift
from .validators import normalize_email, validate_list_email


def as_drf_error(func, value):
    """Run a Django validator and turn its error into a DRF field error."""
    try:
        return func(value)
    except DjangoValidationError as err:
        raise serializers.ValidationError(err.messages)


class DriverSerializer(serializers.ModelSerializer):
    # Uniqueness is checked by hand below, after normalizing case.
    email = serializers.EmailField()
    phone = serializers.CharField(required=False, allow_blank=True)
    color = serializers.ChoiceField(choices=DRIVER_COLORS)

    # For dispatch: what the driver is doing right now (read-only). A list:
    # riders can share the cart.
    current_rides = serializers.SerializerMethodField()
    location = serializers.SerializerMethodField()
    # Usual weekly shifts (read here; changed through /api/drivers/<id>/shifts/).
    shifts = serializers.SerializerMethodField()

    class Meta:
        model = Driver
        fields = ["id", "email", "name", "phone", "color", "current_rides", "location", "shifts"]

    def get_shifts(self, driver):
        return ShiftSerializer(driver.shifts.all(), many=True).data

    def get_current_rides(self, driver):
        from rides.tracking import current_rides

        return [
            {
                "id": ride.id,
                "rider_name": ride.rider_name,
                "pickup_time": ride.pickup_time.isoformat(),
                "pickup_name": ride.pickup_name,
                "dropoff_name": ride.dropoff_name,
                "link_token": ride.link_token,
            }
            for ride in current_rides(driver)
        ]

    def get_location(self, driver):
        from rides.tracking import location_payload

        return location_payload(driver)

    def validate_email(self, value):
        email = normalize_email(value)
        as_drf_error(validate_list_email, email)
        others = Driver.objects.exclude(pk=self.instance.pk) if self.instance else Driver.objects.all()
        if others.filter(email=email).exists():
            raise serializers.ValidationError("A driver with this email already exists.")
        # Someone can't be both; the admin role would hide the driver role.
        if AdminEmail.objects.filter(email=email).exists():
            raise serializers.ValidationError("This email is on the admin list, so it can't be a driver.")
        return email

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Enter the driver's name.")
        return value

    def validate_color(self, value):
        others = Driver.objects.exclude(pk=self.instance.pk) if self.instance else Driver.objects.all()
        taken_by = others.filter(color=value).first()
        if taken_by:
            raise serializers.ValidationError(f"{taken_by.name} already has this color.")
        return value

    def validate_phone(self, value):
        if not value.strip():
            return ""
        return as_drf_error(normalize_phone, value)


class DispatcherSerializer(serializers.ModelSerializer):
    """A dispatcher = an email on the admin list (they sign in with Google)."""

    email = serializers.EmailField()
    is_you = serializers.SerializerMethodField()
    last_sign_in = serializers.SerializerMethodField()

    class Meta:
        model = AdminEmail
        fields = ["id", "email", "created_at", "is_you", "last_sign_in"]
        read_only_fields = ["created_at"]

    def get_is_you(self, admin_email):
        request = self.context.get("request")
        return bool(request and normalize_email(request.user.email) == admin_email.email)

    def get_last_sign_in(self, admin_email):
        from django.contrib.auth import get_user_model

        user = get_user_model().objects.filter(username=admin_email.email).only("last_login").first()
        return user.last_login if user else None

    def validate_email(self, value):
        email = normalize_email(value)
        as_drf_error(validate_list_email, email)
        if AdminEmail.objects.filter(email=email).exists():
            raise serializers.ValidationError("This email is already a dispatcher.")
        if Driver.objects.filter(email=email).exists():
            raise serializers.ValidationError("This email is a driver. Remove them from Drivers first.")
        return email


STEP_MINUTES = 15  # shifts start and end on the quarter hour


class ShiftSerializer(serializers.ModelSerializer):
    start = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])
    end = serializers.TimeField(format="%H:%M", input_formats=["%H:%M", "%H:%M:%S"])

    class Meta:
        model = DriverShift
        fields = ["weekday", "start", "end"]

    def validate(self, attrs):
        start, end = attrs["start"], attrs["end"]
        for t in (start, end):
            if t.minute % STEP_MINUTES or t.second:
                raise serializers.ValidationError("Shifts start and end on the quarter hour.")
        if start >= end:
            raise serializers.ValidationError("A shift has to end after it starts.")
        if start < service_hours.start() or end > service_hours.end():
            raise serializers.ValidationError(
                f"Shifts must be within hours of operation ({service_hours.label(service_hours.start())} "
                f"to {service_hours.label(service_hours.end())})."
            )
        return attrs


class ShiftListSerializer(serializers.Serializer):
    """A driver's whole week at once: [{weekday, start, end}, ...]."""

    shifts = ShiftSerializer(many=True)

    def validate_shifts(self, shifts):
        by_day = {}
        for shift in sorted(shifts, key=lambda s: (s["weekday"], s["start"])):
            previous = by_day.get(shift["weekday"])
            if previous and shift["start"] < previous["end"]:
                raise serializers.ValidationError("Shifts on the same day can't overlap.")
            by_day[shift["weekday"]] = shift
        return shifts
