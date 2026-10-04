"""Hours of operation: when rides can be scheduled.

One source of truth, from settings (SERVICE_START / SERVICE_END, default
7:00 AM to 7:00 PM). The server enforces it; the ride form reads the same
values from the session config, so changing hours never needs a code change.
"""

from datetime import time

from django.conf import settings


def _parse(value, name):
    try:
        hour, minute = (int(part) for part in value.strip().split(":"))
        return time(hour, minute)
    except (ValueError, AttributeError):
        raise ValueError(f"{name} must look like 07:00 (24-hour HH:MM), got {value!r}")


def start():
    return _parse(settings.SERVICE_START, "SERVICE_START")


def end():
    return _parse(settings.SERVICE_END, "SERVICE_END")


def label(t):
    """time(19, 0) → '7:00 PM'"""
    hour = t.hour % 12 or 12
    return f"{hour}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"


def window_message():
    return f"Rides must be between {label(start())} and {label(end())}."


def for_frontend():
    return {"start": start().strftime("%H:%M"), "end": end().strftime("%H:%M")}
