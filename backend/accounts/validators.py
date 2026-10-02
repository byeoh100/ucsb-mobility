from django.conf import settings
from django.core.exceptions import ValidationError


def normalize_email(email):
    return (email or "").strip().lower()


def email_domain_allowed(email):
    """True if the email's domain is an allowed domain or a subdomain of one,
    so "ucsb.edu" allows both name@ucsb.edu and name@umail.ucsb.edu."""
    domain = normalize_email(email).rpartition("@")[2]
    return any(domain == d or domain.endswith("." + d) for d in settings.ALLOWED_EMAIL_DOMAINS)


def validate_list_email(email):
    if not email_domain_allowed(email):
        allowed = ", ".join(settings.ALLOWED_EMAIL_DOMAINS)
        raise ValidationError(f"Only {allowed} email addresses can be added to this list.")
