from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

from .spa import spa_index


def health(request):
    return JsonResponse({"ok": True})


urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/health/", health),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("accounts.urls_api")),
    # Everything else is the React app, which does its own routing.
    re_path(r"^(?!api/|django-admin/|static/).*$", spa_index),
]
