"""A lockout for the developer login at /django-admin/.

Django's admin login has no limit on password guesses. This wraps it: after
MAX_FAILURES wrong passwords for a username, that username is locked for
LOCKOUT_SECONDS. Counted in the shared cache (the database in production).
"""

from django.contrib import admin
from django.core.cache import cache
from django.http import HttpResponse

MAX_FAILURES = 10
LOCKOUT_SECONDS = 15 * 60


def guarded_admin_login(request, extra_context=None):
    if request.method != "POST":
        return admin.site.login(request, extra_context)

    username = request.POST.get("username", "").strip().lower()
    key = f"admin-login-failures:{username}"
    if cache.get(key, 0) >= MAX_FAILURES:
        return HttpResponse("Too many failed sign-in attempts. Try again in 15 minutes.", status=429)

    response = admin.site.login(request, extra_context)
    if request.user.is_authenticated and request.user.is_staff:
        cache.delete(key)
    else:
        cache.set(key, cache.get(key, 0) + 1, LOCKOUT_SECONDS)
    return response
