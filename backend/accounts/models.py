from django.db import models

from common.phone import normalize_phone

from .validators import normalize_email, validate_list_email

# Preset driver colors, picked by the admin: 12 colors, then a light version
# of each (24 drivers). Chosen to be distinct from each other and visible as
# dots on a white page. Add new colors at the end so existing ones keep
# their place in the picker.
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
    ("#f28b82", "Light red"),
    ("#fbb26a", "Light orange"),
    ("#f2d24b", "Light gold"),
    ("#c0dd8a", "Light lime"),
    ("#6fcf8f", "Light green"),
    ("#7fd8d8", "Light teal"),
    ("#7fbcff", "Light blue"),
    ("#a99cf0", "Light indigo"),
    ("#dfa2f2", "Light purple"),
    ("#f7a1cf", "Light pink"),
    ("#d4a98c", "Light brown"),
    ("#c4c7c5", "Light gray"),
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
