from rest_framework.routers import SimpleRouter

from .api import DriverViewSet

router = SimpleRouter()
router.register("drivers", DriverViewSet, basename="driver")
urlpatterns = router.urls
