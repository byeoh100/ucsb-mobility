from django.urls import path
from rest_framework.routers import SimpleRouter

from .api import ArchiveDaysView, ArchiveRidesView, LocationView, RideViewSet

router = SimpleRouter()
router.register("rides", RideViewSet, basename="ride")

urlpatterns = [
    path("archive/", ArchiveRidesView.as_view()),
    path("archive/days/", ArchiveDaysView.as_view()),
    path("location/", LocationView.as_view()),
] + router.urls
