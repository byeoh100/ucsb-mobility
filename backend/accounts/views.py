"""Sign-in for the React app.

Flow: the frontend shows Google's sign-in button. Google hands the browser a
signed ID token, which we POST here. We verify the signature with Google's
public keys, then start a normal Django session (a cookie), so every later
request is just an ordinary logged-in request.

These are plain Django views (not DRF) so Django's CSRF protection applies.
"""

import json
import logging

from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .roles import Role, bootstrap_admin, get_role
from .validators import normalize_email

log = logging.getLogger(__name__)
User = get_user_model()


def session_payload(request):
    user = request.user
    payload = {
        "user": None,
        "config": {"google_client_id": settings.GOOGLE_CLIENT_ID, "dev_login": settings.DEV_LOGIN},
    }
    if user.is_authenticated:
        payload["user"] = {
            "email": user.email,
            "name": user.get_full_name() or user.email,
            "role": get_role(user),
        }
    return payload


def sign_in(request, email, first_name="", last_name=""):
    email = normalize_email(email)
    user, _ = User.objects.get_or_create(username=email, defaults={"email": email})
    user.email = email
    if first_name or last_name:
        user.first_name, user.last_name = first_name[:150], last_name[:150]
    bootstrap_admin(email)
    # Keep Django's own flags in step with the admin list so the raw-data
    # admin at /django-admin/ works for admins. (Access is still re-checked
    # against the list on every request.)
    is_admin = get_role(user) == Role.ADMIN
    user.is_staff = user.is_superuser = is_admin
    user.set_unusable_password()
    user.save()
    login(request, user)


def parse_json(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return None


@require_GET
@ensure_csrf_cookie
def session(request):
    """Who's signed in, plus the config the sign-in page needs.
    Also guarantees the CSRF cookie is set before any POST."""
    return JsonResponse(session_payload(request))


@require_POST
def google_sign_in(request):
    data = parse_json(request)
    if not data or not data.get("credential"):
        return JsonResponse({"error": "Missing Google credential."}, status=400)
    if not settings.GOOGLE_CLIENT_ID:
        return JsonResponse({"error": "Google sign-in isn't configured on the server."}, status=503)

    try:
        info = id_token.verify_oauth2_token(
            data["credential"], google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        log.warning("Rejected an invalid Google ID token")
        return JsonResponse({"error": "Google sign-in failed. Try again."}, status=400)

    if not info.get("email") or not info.get("email_verified"):
        return JsonResponse({"error": "Your Google account email isn't verified."}, status=400)

    sign_in(request, info["email"], info.get("given_name", ""), info.get("family_name", ""))
    return JsonResponse(session_payload(request))


@require_POST
def dev_sign_in(request):
    """Local testing only: sign in as any email without Google."""
    if not (settings.DEBUG and settings.DEV_LOGIN):
        return JsonResponse({"error": "Not found."}, status=404)
    data = parse_json(request) or {}
    email = normalize_email(data.get("email"))
    if "@" not in email:
        return JsonResponse({"error": "Enter an email address."}, status=400)
    sign_in(request, email)
    return JsonResponse(session_payload(request))


@require_POST
def sign_out(request):
    logout(request)
    return JsonResponse(session_payload(request))
