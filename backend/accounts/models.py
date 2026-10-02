from django.db import models

from common.phone import normalize_phone

from .validators import normalize_email, validate_list_email

# Preset driver colors, picked by the admin. Chosen to be distinct from each
# other and readable as row accents on a white table.
DRIVER_COLORS = [
    ("#d93025", "Red"),
    ("#e8710a", "Orange"),
    ("#c9a100", "Gold"),
    ("#7cb342", "Lime"),
    ("#188038", "Green"),
    ("#12a4af", "Teal"),
    ("#1a73e8", "Blue"),
    ("#3f51b5", "Indigo"),
    ("#9334e6", "Purple"),
    ("#d01884", "Pink"),
    ("#8d6e63", "Brown"),
    ("#5f6368", "Gray"),
]


class AdminEmail(models.Model):
    """Anyone whose Google account email is on this list gets the admin role."""

    email = models.EmailField(unique=True, validators=[validate_list_email])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["email"]
        verbose_name = "admin email"

    def save(self, *args, **kwargs):
        self.email = normalize_email(self.email)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email


class Driver(models.Model):
    """A driver. Their Google account email is what gives them the driver role,
    so drivers never create an account; the admin just adds them here."""

    email = models.EmailField(unique=True, validators=[validate_list_email])
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=30, blank=True)
    # One driver per color, so ride color coding is unambiguous.
    color = models.CharField(
        max_length=7, choices=DRIVER_COLORS, unique=True,
        error_messages={"unique": "Another driver already has this color."},
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def clean(self):
        # Runs for forms like the Django admin; the API does the same in its serializer.
        if self.phone:
            self.phone = normalize_phone(self.phone)

    def save(self, *args, **kwargs):
        self.email = normalize_email(self.email)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name
