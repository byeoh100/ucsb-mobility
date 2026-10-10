"""Who is this user? Roles come from the email lists, checked on every request,
so adding or removing someone from a list takes effect immediately."""

import logging

from django.conf import settings
from django.db.models import TextChoices

from . import backup
from .models import AdminEmail, Driver
from .validators import email_domain_allowed, normalize_email

log = logging.getLogger(__name__)


def driver_for(user):
    """The Driver row for a signed-in user, or None."""
    return Driver.objects.filter(email=normalize_email(user.email)).first()


class Role(TextChoices):
    ADMIN = "admin"
    DRIVER = "driver"
    RIDER = "rider"


def get_role(user):
    """Admin list wins over the driver list. Everyone else signed in is a rider."""
    if not user or not user.is_authenticated:
        return None
    email = normalize_email(user.email)
    backup_name = backup.username_from_email(email)
    if backup_name is not None:
        # Backup accounts only work while their password is set.
        if not backup.enabled(backup_name):
            return Role.RIDER
        if backup_name == "dispatch":
            return Role.ADMIN
        # The backup driver is a driver through its Driver row, like anyone else.
    if AdminEmail.objects.filter(email=email).exists():
        return Role.ADMIN
    if Driver.objects.filter(email=email).exists():
        return Role.DRIVER
    return Role.RIDER


def bootstrap_admin(email):
    """If the admin list is empty and this is BOOTSTRAP_ADMIN_EMAIL, add it.

    This only ever fires while there are no admins, so it seeds the first one
    and then stays out of the way.
    """
    target = settings.BOOTSTRAP_ADMIN_EMAIL
    if not target or normalize_email(email) != target or AdminEmail.objects.exists():
        return False
    if not email_domain_allowed(target):
        log.error("BOOTSTRAP_ADMIN_EMAIL %s isn't in ALLOWED_EMAIL_DOMAINS; not adding it.", target)
        return False
    AdminEmail.objects.create(email=target)
    log.info("Bootstrapped first admin: %s", target)
    return True
