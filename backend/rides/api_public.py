"""Public (no sign-in) endpoints for riders. The ride's link token is the key."""

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from common.phone import normalize_phone

from .models import Ride
from .rider_page import COMPLETE, EXPIRED, LIVE, UPCOMING, page_payload, phase_of, ride_status
from .status import LINK_WINDOW, ON_THE_WAY


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
        if phase_of(ride, now) != LIVE or ride_status(ride, now) != ON_THE_WAY:
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


class RideLookupView(Public):
    """GET /api/lookup/?phone=...: a rider's upcoming rides by phone number.

    Only today-and-later rides whose links haven't expired; only time and
    route. Rate-limited (10/min per visitor) so numbers can't be trawled.
    """

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ride_lookup"

    def get(self, request):
        try:
            phone = normalize_phone(request.query_params.get("phone", ""))
        except Exception:
            return Response({"error": "Enter a 10-digit phone number."}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        rides = Ride.objects.filter(rider_phone=phone, pickup_time__gt=now - LINK_WINDOW).order_by("pickup_time")[:10]
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
