from datetime import date as date_type

from django.db import transaction
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
from .recurrence import SHARED_FIELDS, create_series, same_time_on
from .serializers import RideSerializer
from .status import COMPLETED, ON_THE_WAY, statuses_for


def parse_date(raw):
    try:
        return date_type.fromisoformat(raw)
    except (TypeError, ValueError):
        raise serializers.ValidationError({"date": "Use YYYY-MM-DD."})


def ride_statuses(rides):
    return statuses_for(rides, timezone.now())


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
        if self.action in ("list", "retrieve", "start", "unstart", "complete", "reopen"):
            return [IsDriverOrAdmin()]
        return [IsAdmin()]

    def get_queryset(self):
        rides = Ride.objects.select_related("driver").order_by("pickup_time")
        if self.action == "list":
            day = self.requested_date()
            if day < archive_cutoff():
                return rides.none()  # archived: see /api/archive/
            rides = rides.filter(pickup_time__date=day)
        elif not viewer_for(self.request)["is_admin"]:
            # Drivers can open a single ride only if it isn't archived; the
            # archive is dispatch-only.
            rides = rides.filter(pickup_time__date__gte=archive_cutoff())
        return rides

    def requested_date(self):
        raw = self.request.query_params.get("date")
        return parse_date(raw) if raw else timezone.localdate()

    def list(self, request, *args, **kwargs):
        purge_expired()  # retention cleanup rides along with normal page loads
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        """POST with "repeat": {"days", "until"} adds one ride per matching day
        (a series). Answers with the first ride plus "series_count"."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        repeat = serializer.validated_data.pop("repeat", None)
        if repeat is None:
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        rides = create_series(serializer.validated_data, repeat["dates"])
        data = self.get_serializer(rides[0]).data
        data["series_count"] = len(rides)
        return Response(data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        ride = self.get_object()
        if is_archived(ride):
            return archived_response()
        if wants_following(request, ride):
            return self.update_following(request, ride, partial=kwargs.get("partial", False))
        return super().update(request, *args, **kwargs)

    def update_following(self, request, ride, partial):
        """PATCH ...?scope=following: this ride and the series' later rides.

        Later rides get the same rider, places, notes, driver, and time of day,
        each keeping its own date. Rides already started or completed are left
        alone.
        """
        serializer = self.get_serializer(ride, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        new_time = data.get("pickup_time")
        if new_time and timezone.localtime(new_time).date() != timezone.localtime(ride.pickup_time).date():
            return error("To move a repeating ride to another day, change just that ride.")
        later = list(
            Ride.objects.filter(series=ride.series, pickup_time__gt=ride.pickup_time, started_at=None, completed_at=None)
        )
        with transaction.atomic():
            serializer.save()
            for other in later:
                for field in SHARED_FIELDS:
                    if field in data:
                        setattr(other, field, data[field])
                if new_time:
                    other.pickup_time = same_time_on(other, new_time)
                other.save()
        data = self.get_serializer(ride).data
        data["series_count"] = len(later) + 1
        return Response(data)

    def destroy(self, request, *args, **kwargs):
        ride = self.get_object()
        if is_archived(ride):
            return archived_response()
        if wants_following(request, ride):
            # This ride and every later ride in its series.
            Ride.objects.filter(series=ride.series, pickup_time__gte=ride.pickup_time).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        return super().destroy(request, *args, **kwargs)

    # --- Driver actions -----------------------------------------------------

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """POST /api/rides/<id>/start/: the driver taps "On the way".

        "Set as current" on the driver's screen. A driver can have several
        rides on the way at once (riders sharing the cart); starting one
        doesn't end the others.
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

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """POST /api/rides/<id>/complete/: the driver drops this rider off.
        Closes the rider's link (it shows "ride complete"); location sharing
        stops once no ride is on the way. Without it, the ride ends on its
        own RIDE_CUTOFF after pickup (see rides/status.py)."""
        ride, problem = self.own_ride_for_today(request)
        if problem:
            return problem
        if self.statuses([ride])[ride.id] != ON_THE_WAY:
            return error("Only a ride that's on the way can be marked complete.")
        ride.completed_at = timezone.now()
        ride.save(update_fields=["completed_at", "updated_at"])
        return Response(self.get_serializer(ride).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """POST /api/rides/<id>/reopen/: undo a mistaken "Mark complete"."""
        ride, problem = self.own_ride_for_today(request)
        if problem:
            return problem
        if not ride.completed_at:
            return error("This ride wasn't marked complete.")
        ride.completed_at = None
        # Only if it would actually be on the way again (not past the cutoff).
        if self.statuses([ride])[ride.id] != ON_THE_WAY:
            return error("This ride can't be reopened anymore.")
        ride.save(update_fields=["completed_at", "updated_at"])
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


def wants_following(request, ride):
    """?scope=following on a ride that's part of a series."""
    return request.query_params.get("scope") == "following" and ride.series is not None


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
        from .tracking import current_rides

        driver = Driver.objects.filter(email=normalize_email(request.user.email)).first()
        if driver is None:
            return error("Only drivers share their location.", status.HTTP_403_FORBIDDEN)
        if not current_rides(driver):
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

    {"retention_days": 90, "days": [{"date": "2026-10-01", "count": 41}, ...]}
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


class StatsView(APIView):
    """GET /api/stats/?from=YYYY-MM-DD&to=YYYY-MM-DD: the Metrics page's numbers
    for those campus dates (inclusive), at most a year. Dispatch only.

    What's in it, and what counts as a ride: rides/metrics.py (range_stats).
    """

    permission_classes = [IsAdmin]

    def get(self, request):
        from .metrics import range_stats

        first = parse_date(request.query_params.get("from"))
        last = parse_date(request.query_params.get("to"))
        if first > last:
            return error("The start date has to be on or before the end date.")
        if (last - first).days > 366:
            return error("Pick a range of a year or less.")
        return Response(range_stats(first, last))
