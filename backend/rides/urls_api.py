from rest_framework.routers import SimpleRouter

from .api import RideViewSet

router = SimpleRouter()
router.register("rides", RideViewSet, basename="ride")
urlpatterns = router.urls
