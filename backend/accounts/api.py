from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from rest_framework import status

from .models import DRIVER_COLORS, AdminEmail, Driver
from .permissions import IsAdmin
from .serializers import DispatcherSerializer, DriverSerializer


class DriverViewSet(viewsets.ModelViewSet):
    """Admin-only driver management.

    GET    /api/drivers/          list (sorted by name)
    POST   /api/drivers/          add
    PATCH  /api/drivers/<id>/     edit
    DELETE /api/drivers/<id>/     remove (their rides become unassigned, once rides exist)
    GET    /api/drivers/colors/   the 24 preset colors
    """

    queryset = Driver.objects.order_by("name")
    serializer_class = DriverSerializer
    permission_classes = [IsAdmin]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete"]

    @action(detail=False)
    def colors(self, request):
        return Response([{"value": value, "label": label} for value, label in DRIVER_COLORS])


class DispatcherViewSet(viewsets.ModelViewSet):
    """Dispatchers (the admin email list), managed by dispatchers themselves.

    GET    /api/dispatchers/        list
    POST   /api/dispatchers/        add {email}
    DELETE /api/dispatchers/<id>/   remove (never the last one)

    This is how the program runs its own staff list, without /django-admin/.
    """

    queryset = AdminEmail.objects.order_by("email")
    serializer_class = DispatcherSerializer
    permission_classes = [IsAdmin]
    pagination_class = None
    http_method_names = ["get", "post", "delete"]

    def destroy(self, request, *args, **kwargs):
        if AdminEmail.objects.count() <= 1:
            return Response(
                {"error": "You can't remove the last dispatcher. Add someone else first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)
