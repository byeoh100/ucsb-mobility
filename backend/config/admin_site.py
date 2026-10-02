"""Django's built-in admin, kept as a developer escape hatch at /django-admin/.

Dispatch uses the React admin pages. This one is for inspecting or fixing
raw data. Access follows the same admin email list as everything else.
"""

from urllib.parse import quote

from django.contrib import admin
from django.http import HttpResponseForbidden
from django.shortcuts import redirect
from django.utils.http import url_has_allowed_host_and_scheme


class DispatchAdminSite(admin.AdminSite):
    site_header = "Cart Dispatch (raw data)"
    site_title = "Cart Dispatch"

    def has_permission(self, request):
        from accounts.roles import Role, get_role

        return get_role(request.user) == Role.ADMIN

    def login(self, request, extra_context=None):
        # Signed in but not an admin: sending them to sign-in would just loop.
        if request.user.is_authenticated:
            return HttpResponseForbidden("This account isn't on the admin list.")
        # No passwords here; sign in with Google on the main site, then come back.
        next_url = request.GET.get("next", "/django-admin/")
        if not url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
            next_url = "/django-admin/"
        return redirect(f"/sign-in?next={quote(next_url)}")
