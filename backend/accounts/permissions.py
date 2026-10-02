"""DRF permission classes for API views in later parts.

    permission_classes = [IsAdmin]           # admin pages
    permission_classes = [IsDriverOrAdmin]   # driver pages (admins see everything)
"""

from rest_framework.permissions import BasePermission

from .roles import Role, get_role


class IsAdmin(BasePermission):
    message = "Admins only."

    def has_permission(self, request, view):
        return get_role(request.user) == Role.ADMIN


class IsDriverOrAdmin(BasePermission):
    message = "Drivers only."

    def has_permission(self, request, view):
        return get_role(request.user) in (Role.ADMIN, Role.DRIVER)
