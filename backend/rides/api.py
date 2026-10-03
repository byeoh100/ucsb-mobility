from datetime import date as date_type

from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Driver
from accounts.permissions import IsAdmin, IsDriverOrAdmin
from accounts.validators import normalize_email

from .archive import archive_cutoff, is_archived, purge_expired
from .models import Ride
from .serializers import RideSerializer
from .status import COMPLETED, ON_THE_WAY, statuses_for


def parse_date(raw):
    try:
        return date_type.fromisoformat(raw)
    except (TypeError, ValueError):
        raise serializers.ValidationError({"date": "Use YYYY-MM-DD."})


def ride_statuses(rides):
    # Include the same drivers' starts from other rides, so a ride is
    # "completed" once its driver has started a later one, even if that
    # later ride isn't in this list.
    driver_ids = {r.driver_id for r in rides if r.driver_id}
    starts = Ride.objects.filter(driver_id__in=driver_ids, started_at__isnull=False).values_list(
        "driver_id", "started_at"
    )
    return statuses_for(rides, timezone.now(), other_starts=starts)


class RideViewSet(viewsets.ModelViewSet):
    """Rides for one day at a time.

    GET    /api/rides/?date=2026-10-05   that day's rides (default: today)
    POST   /api/rides/                   add          (admins)
    PATCH  /api/rides/<id>/              edit         (admins)
    DELETE /api/rides/<id>/              delete       (admins)

    Drivers can read the full list too (they see all rides so they can
    trade by word of mouth), but only admins can change anything.

    Archived days (see rides/archive.py) aren't listed here, and archived
    rides can't be edited or deleted; they're read through /api/archive/.
    """

    serializer_class = RideSerializer
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete"]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "start", "unstart"):
            return [IsDriverOrAdmin()]
        return [IsAdmin()]

    def get_queryset(self):
        rides = Ride.objects.select_related("driver").order_by("pickup_time")
        if self.action == "list":
            day = self.requested_date()
            if day < archive_cutoff():
                return rides.none()  # archived: see /api/archive/
            rides = rides.filter(pickup_time__date=day)
        return rides

    def requested_date(self):
        raw = self.request.query_params.get("date")
        return parse_date(raw) if raw else timezone.localdate()

    def list(self, request, *args, **kwargs):
        purge_expired()  # retention cleanup rides along with normal page loads
        return super().list(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if is_archived(self.get_object()):
            return archived_response()
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if is_archived(self.get_object()):
            return archived_response()
        return super().destroy(request, *args, **kwargs)

    # --- Driver actions -----------------------------------------------------

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """POST /api/rides/<id>/start/: the driver taps "On the way".

        Starting a ride also completes the driver's previous one (see
        rides/status.py), so drivers never have to mark rides done.
        """
        ride, problem = self.own_ride_for_today(request)
        if problem:
            return problem
        current = self.statuses([ride])[ride.id]
        if current == COMPLETED:
            return error("This ride is already completed.")
        if current != ON_THE_WAY:
            ride.started_at = timezone.now()
            ride.save(update_fields=["started_at", "updated_at"])
        return Response(self.get_serializer(ride).data)

    @action(detail=True, methods=["post"])
    def unstart(self, request, pk=None):
        """POST /api/rides/<id>/unstart/: undo a mistaken "On the way"."""
        ride, problem = self.own_ride_for_today(request)
        if problem:
            return problem
        if self.statuses([ride])[ride.id] != ON_THE_WAY:
            return error("Only a ride that's on the way can be undone.")
        ride.started_at = None
        ride.save(update_fields=["started_at", "updated_at"])
        return Response(self.get_serializer(ride).data)

    def own_ride_for_today(self, request):
        """The ride, if it's the signed-in driver's and it's today; else an error."""
        ride = self.get_object()
        driver = Driver.objects.filter(email=normalize_email(request.user.email)).first()
        if driver is None or ride.driver_id != driver.id:
            return ride, error("Only the driver assigned to this ride can do that.", status.HTTP_403_FORBIDDEN)
        if timezone.localtime(ride.pickup_time).date() != timezone.localdate():
            return ride, error("You can only start today's rides.")
        return ride, None

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["now"] = timezone.now()
        context["viewer"] = viewer_for(self.request)
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
        return ride_statuses(rides)


def viewer_for(request):
    """Who's looking, for hiding other drivers' ride progress (see RideSerializer)."""
    from accounts.roles import Role, get_role

    if get_role(request.user) == Role.ADMIN:
        return {"is_admin": True, "driver_id": None}
    driver = Driver.objects.filter(email=normalize_email(request.user.email)).first()
    return {"is_admin": False, "driver_id": driver.id if driver else None}


def error(message, code=status.HTTP_400_BAD_REQUEST):
    return Response({"error": message}, status=code)


def archived_response():
    return error("This ride is archived and can't be changed.")


class LocationView(APIView):
    """POST /api/location/  {"lat", "lng", "accuracy"}: the driver's phone reporting in.

    Only accepted while the driver has a ride on the way. Otherwise it answers
    409 with {"sharing": false}, and the phone stops sending.
    """

    permission_classes = [IsDriverOrAdmin]

    def post(self, request):
        from .models import DriverLocation
        from .tracking import current_ride

        driver = Driver.objects.filter(email=normalize_email(request.user.email)).first()
        if driver is None:
            return error("Only drivers share their location.", status.HTTP_403_FORBIDDEN)
        if current_ride(driver) is None:
            return Response({"sharing": False, "error": "No ride on the way."}, status=status.HTTP_409_CONFLICT)
        try:
            lat, lng = float(request.data["lat"]), float(request.data["lng"])
            accuracy = request.data.get("accuracy")
            accuracy = float(accuracy) if accuracy is not None else None
        except (KeyError, TypeError, ValueError):
            return error("Send lat and lng as numbers.")
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return error("That isn't a valid location.")
        DriverLocation.objects.update_or_create(driver=driver, defaults={"lat": lat, "lng": lng, "accuracy_m": accuracy})
        return Response({"sharing": True})


class ArchiveDaysView(APIView):
    """GET /api/archive/days/: which days have archived rides (newest first).

    {"retention_days": 30, "days": [{"date": "2026-10-01", "count": 41}, ...]}
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        from django.conf import settings

        purge_expired()
        days = (
            Ride.objects.filter(pickup_time__date__lt=archive_cutoff())
            .annotate(day=TruncDate("pickup_time", tzinfo=timezone.get_current_timezone()))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("-day")
        )
        return Response({
            "retention_days": settings.ARCHIVE_RETENTION_DAYS,
            "days": [{"date": d["day"].isoformat(), "count": d["count"]} for d in days],
        })


class ArchiveRidesView(APIView):
    """GET /api/archive/?date=YYYY-MM-DD: one archived day's rides (read-only)."""

    permission_classes = [IsAdmin]

    def get(self, request):
        day = parse_date(request.query_params.get("date"))
        if day >= archive_cutoff():
            return Response({"date": "That day hasn't been archived yet."}, status=status.HTTP_400_BAD_REQUEST)
        rides = list(Ride.objects.select_related("driver").filter(pickup_time__date=day).order_by("pickup_time"))
        data = RideSerializer(rides, many=True, context={"statuses": ride_statuses(rides)}).data
        return Response(data)
