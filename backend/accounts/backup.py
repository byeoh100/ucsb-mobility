"""Backup sign-in, for when Google or UCSB sign-in isn't working.

Two fixed usernames, "dispatch" (admin) and "driver" (driver). Their
passwords come from settings (FALLBACK_DISPATCH_PASSWORD,
FALLBACK_DRIVER_PASSWORD), never from code. An account with no password set
is switched off, and removing a password also cuts off anyone already signed
in with it (see roles.get_role).

Backup users get emails on a reserved domain that can never belong to a real
Google account, so nobody can sign in as them through Google.
"""

import hmac

from django.conf import settings

BACKUP_DOMAIN = "backup.cartdispatch.invalid"  # ".invalid" is reserved: never a real address
ACCOUNTS = {
    "dispatch": "FALLBACK_DISPATCH_PASSWORD",
    "driver": "FALLBACK_DRIVER_PASSWORD",
}
BACKUP_DRIVER_NAME = "Backup driver"


def password_for(username):
    setting = ACCOUNTS.get(username)
    return getattr(settings, setting, "") if setting else ""


def enabled(username):
    return bool(password_for(username))


def any_enabled():
    return any(enabled(name) for name in ACCOUNTS)


def email_for(username):
    return f"{username}@{BACKUP_DOMAIN}"


def username_from_email(email):
    """'dispatch' for dispatch@backup.cartdispatch.invalid; None for anyone else."""
    local, _, domain = (email or "").lower().partition("@")
    return local if domain == BACKUP_DOMAIN and local in ACCOUNTS else None


def password_matches(username, password):
    expected = password_for(username)
    # Constant-time comparison, so response timing doesn't hint at the password.
    if not isinstance(password, str):
        return False
    return bool(expected) and hmac.compare_digest(expected.encode(), password.encode())


def ensure_driver_profile():
    """The backup driver's Driver row (so dispatch can assign rides to it).
    Created on first sign-in with the first free color; None if all colors are taken."""
    from .models import DRIVER_COLORS, Driver

    email = email_for("driver")
    driver = Driver.objects.filter(email=email).first()
    if driver:
        return driver
    taken = set(Driver.objects.values_list("color", flat=True))
    free = next((value for value, _ in DRIVER_COLORS if value not in taken), None)
    if free is None:
        return None
    return Driver.objects.create(email=email, name=BACKUP_DRIVER_NAME, color=free)
