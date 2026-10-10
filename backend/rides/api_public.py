"""Public (no sign-in) endpoints for riders. The ride's link token is the key."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework.views import APIView

from common.phone import normalize_phone

from .models import Ride
from .rider_page import COMPLETE, EXPIRED, LIVE, UPCOMING, page_payload, phase_of
from .status import ON_THE_WAY, RIDE_CUTOFF, status_of


class Public(APIView):
    permission_classes = [AllowAny]

    def ride(self, token):
        return get_object_or_404(Ride.objects.select_related("driver"), link_token=token)


class RiderPageView(Public):
    """GET /api/r/<token>/: everything the rider page shows, for its current phase."""

    def get(self, request, token):
        return Response(page_payload(self.ride(token)))


class RiderConfirmView(Public):
    """POST /api/r/<token>/confirm/: the rider's thumbs up ("I'll be there")."""

    def post(self, request, token):
        ride = self.ride(token)
        now = timezone.now()
        if phase_of(ride, now) != LIVE or status_of(ride, now) != ON_THE_WAY:
            return Response({"error": "You can confirm once your driver is on the way."}, status=status.HTTP_400_BAD_REQUEST)
        if ride.rider_confirmed_at is None:
            ride.rider_confirmed_at = now
            ride.save(update_fields=["rider_confirmed_at", "updated_at"])
        return Response(page_payload(ride, now))


class RiderPinsView(Public):
    """PUT /api/r/<token>/pins/  {"pickup": {x, y} | null, "dropoff": {x, y} | null}

    The rider's optional spots on the campus map, as fractions of the image.
    """

    def put(self, request, token):
        ride = self.ride(token)
        if phase_of(ride, timezone.now()) not in (UPCOMING, LIVE):
            return Response({"error": "This ride can't be changed anymore."}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(request.data, dict):
            return Response({"error": "Send pickup and dropoff pins."}, status=status.HTTP_400_BAD_REQUEST)
        updates = {}
        for which in ("pickup", "dropoff"):
            if which not in request.data:
                continue
            value = request.data[which]
            if value is None:
                updates[f"{which}_x"] = updates[f"{which}_y"] = None
                continue
            try:
                x, y = float(value["x"]), float(value["y"])
            except (TypeError, KeyError, ValueError):
                return Response({"error": "Pins need x and y numbers."}, status=status.HTTP_400_BAD_REQUEST)
            if not (0 <= x <= 1 and 0 <= y <= 1):
                return Response({"error": "Pins must be on the map."}, status=status.HTTP_400_BAD_REQUEST)
            updates[f"{which}_x"], updates[f"{which}_y"] = x, y
        for field, value in updates.items():
            setattr(ride, field, value)
        ride.save(update_fields=[*updates, "updated_at"])
        return Response(page_payload(ride))


class PhoneNumberThrottle(SimpleRateThrottle):
    """Limits lookups of any one phone number, whoever is asking."""

    scope = "ride_lookup_number"

    def get_cache_key(self, request, view):
        import hashlib

        try:
            phone = normalize_phone(request.query_params.get("phone", ""))
        except Exception:
            return None  # invalid numbers are rejected by the view anyway
        # Hashed, so phone numbers aren't stored in the cache as-is.
        return f"throttle_lookup_number_{hashlib.sha256(phone.encode()).hexdigest()[:32]}"


class GlobalLookupThrottle(SimpleRateThrottle):
    """A ceiling on lookups across everyone, so numbers can't be trawled."""

    scope = "ride_lookup_global"

    def get_cache_key(self, request, view):
        return "throttle_lookup_global"


class RideLookupView(Public):
    """GET /api/lookup/?phone=...: a rider's upcoming rides by phone number.

    Only today-and-later rides whose links haven't expired; only time and
    route. Rate-limited per visitor, per phone number, and overall, so
    numbers can't be trawled and no one number can be looked up repeatedly.
    """

    throttle_classes = [ScopedRateThrottle, PhoneNumberThrottle, GlobalLookupThrottle]
    throttle_scope = "ride_lookup"

    def check_throttles(self, request):
        # Stop at the first limit that says no. (DRF's default asks every
        # throttle, so requests one visitor gets refused would still use up
        # the shared ceiling, letting one visitor lock everyone out.)
        for throttle in self.get_throttles():
            if not throttle.allow_request(request, self):
                self.throttled(request, throttle.wait())

    def get(self, request):
        try:
            phone = normalize_phone(request.query_params.get("phone", ""))
        except Exception:
            return Response({"error": "Enter a 10-digit phone number."}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        # RIDE_CUTOFF so a late ride still under way is found; phase_of below
        # drops the ones that are over.
        rides = Ride.objects.filter(rider_phone=phone, pickup_time__gt=now - RIDE_CUTOFF).order_by("pickup_time")[:10]
        return Response([
            {
                "pickup_time": timezone.localtime(r.pickup_time).isoformat(),
                "pickup_name": r.pickup_name,
                "dropoff_name": r.dropoff_name,
                "link_token": r.link_token,
            }
            for r in rides
            if phase_of(r, now) not in (COMPLETE, EXPIRED)
        ])
