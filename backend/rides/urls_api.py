from django.urls import path
from rest_framework.routers import SimpleRouter

from .api import ArchiveDaysView, ArchiveRidesView, LocationView, RideViewSet
from .api_public import RideLookupView, RiderConfirmView, RiderPageView, RiderPinsView

router = SimpleRouter()
router.register("rides", RideViewSet, basename="ride")

urlpatterns = [
    path("archive/", ArchiveRidesView.as_view()),
    path("archive/days/", ArchiveDaysView.as_view()),
    path("location/", LocationView.as_view()),
    # Public, for riders (no sign-in; the link token is the key)
    path("r/<str:token>/", RiderPageView.as_view()),
    path("r/<str:token>/confirm/", RiderConfirmView.as_view()),
    path("r/<str:token>/pins/", RiderPinsView.as_view()),
    path("lookup/", RideLookupView.as_view()),
] + router.urls
