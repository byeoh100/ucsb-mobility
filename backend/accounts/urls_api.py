from rest_framework.routers import SimpleRouter

from .api import DispatcherViewSet, DriverViewSet

router = SimpleRouter()
router.register("drivers", DriverViewSet, basename="driver")
router.register("dispatchers", DispatcherViewSet, basename="dispatcher")
urlpatterns = router.urls
