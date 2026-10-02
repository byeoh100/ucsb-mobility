"""Phone numbers are stored as 10 digits ("8055550123") so lookups match no
matter how someone typed the number. Formatting for display happens in the
frontend."""

import re

from django.core.exceptions import ValidationError


def normalize_phone(value):
    """Return 10 digits, or raise ValidationError.

    Accepts any common US format: (805) 555-0123, 805.555.0123,
    +1 805 555 0123, 18055550123, etc.
    """
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        raise ValidationError("Enter a 10-digit US phone number.")
    return digits
