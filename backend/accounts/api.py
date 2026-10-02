from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import DRIVER_COLORS, Driver
from .permissions import IsAdmin
from .serializers import DriverSerializer


class DriverViewSet(viewsets.ModelViewSet):
    """Admin-only driver management.

    GET    /api/drivers/          list (sorted by name)
    POST   /api/drivers/          add
    PATCH  /api/drivers/<id>/     edit
    DELETE /api/drivers/<id>/     remove (their rides become unassigned, once rides exist)
    GET    /api/drivers/colors/   the 12 preset colors
    """

    queryset = Driver.objects.order_by("name")
    serializer_class = DriverSerializer
    permission_classes = [IsAdmin]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete"]

    @action(detail=False)
    def colors(self, request):
        return Response([{"value": value, "label": label} for value, label in DRIVER_COLORS])
