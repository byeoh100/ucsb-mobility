from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from common.phone import normalize_phone

from .models import DRIVER_COLORS, AdminEmail, Driver
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

    class Meta:
        model = Driver
        fields = ["id", "email", "name", "phone", "color"]

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
