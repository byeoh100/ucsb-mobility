from datetime import date as date_type

from django.utils import timezone
from rest_framework import serializers, viewsets

from accounts.permissions import IsAdmin, IsDriverOrAdmin

from .models import Ride
from .serializers import RideSerializer
from .status import statuses_for


class RideViewSet(viewsets.ModelViewSet):
    """Rides for one day at a time.

    GET    /api/rides/?date=2026-10-05   that day's rides (default: today)
    POST   /api/rides/                   add          (admins)
    PATCH  /api/rides/<id>/              edit         (admins)
    DELETE /api/rides/<id>/              delete       (admins)

    Drivers can read the full list too (they see all rides so they can
    trade by word of mouth), but only admins can change anything.
    """

    serializer_class = RideSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsDriverOrAdmin()]
        return [IsAdmin()]

    def get_queryset(self):
        rides = Ride.objects.select_related("driver").order_by("pickup_time")
        if self.action == "list":
            rides = rides.filter(pickup_time__date=self.requested_date())
        return rides

    def requested_date(self):
        raw = self.request.query_params.get("date")
        if not raw:
            return timezone.localdate()
        try:
            return date_type.fromisoformat(raw)
        except ValueError:
            raise serializers.ValidationError({"date": "Use YYYY-MM-DD."})

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["now"] = timezone.now()
        return context

    def get_serializer(self, *args, **kwargs):
        # Work out statuses for everything being returned in one pass.
        instance = args[0] if args else kwargs.get("instance")
        if instance is not None:
            rides = list(instance) if hasattr(instance, "__iter__") else [instance]
            kwargs.setdefault("context", self.get_serializer_context())
            kwargs["context"]["statuses"] = self.statuses(rides)
        return super().get_serializer(*args, **kwargs)

    def statuses(self, rides):
        # Include the same drivers' starts from other rides, so a ride is
        # "completed" once its driver has started a later one, even if that
        # later ride isn't in this list.
        driver_ids = {r.driver_id for r in rides if r.driver_id}
        starts = Ride.objects.filter(driver_id__in=driver_ids, started_at__isnull=False).values_list(
            "driver_id", "started_at"
        )
        return statuses_for(rides, timezone.now(), other_starts=starts)
