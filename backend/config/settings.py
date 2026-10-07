"""
Settings for UCSB Mobility Tracker.

Everything that differs between your laptop and production comes from
environment variables, so the same code runs in both places. Locally, put
them in backend/.env (copy .env.example); in production, set them on the host.

  DJANGO_DEBUG                "true" locally; leave unset in production
  DJANGO_SECRET_KEY           required when DEBUG is off
  DATABASE_URL                Postgres URL in production; SQLite if unset
  GOOGLE_CLIENT_ID            OAuth client ID from Google Cloud Console
  BOOTSTRAP_ADMIN_EMAIL       your email; added to the admin list on first sign-in
                              if the admin list is empty
  ALLOWED_EMAIL_DOMAINS       domains allowed on the admin/driver lists
                              (default "ucsb.edu", which also allows umail.ucsb.edu)
  DEV_LOGIN                   "true" to show a sign-in-as-any-email form (DEBUG only)
  FALLBACK_DISPATCH_PASSWORD  password for backup sign-in "dispatch" (blank = off)
  FALLBACK_DRIVER_PASSWORD    password for backup sign-in "driver" (blank = off)
  ARCHIVE_RETENTION_DAYS      days archived rides are kept (default 30)
  SERVICE_START, SERVICE_END  hours of operation, 24-hour HH:MM (default 07:00 to 19:00)
  DISPATCH_PHONE              dispatch's number, shown on rider pages
  PRIVACY_CONTACT_EMAIL       contact for privacy questions, shown on /privacy
  TIME_ZONE                   campus time zone (default America/Los_Angeles)
  DJANGO_ALLOWED_HOSTS        extra hostnames, comma-separated (custom domains)
  DJANGO_CSRF_TRUSTED_ORIGINS extra origins, comma-separated, with https://
"""

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


BASE_DIR = Path(__file__).resolve().parent.parent

# Load backend/.env if it exists (local development). Variables already set in
# the environment win, so production settings are never overridden by a file.
load_dotenv(BASE_DIR / ".env")
FRONTEND_DIST = BASE_DIR / "frontend_dist"  # `npm run build` writes the React app here

DEBUG = env_bool("DJANGO_DEBUG")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-only-insecure-key"
    else:
        raise RuntimeError("DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off.")

ALLOWED_HOSTS = ["localhost", "127.0.0.1"] + env_list("DJANGO_ALLOWED_HOSTS")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS")
if DEBUG:
    # The Vite dev server proxies API calls from these origins.
    CSRF_TRUSTED_ORIGINS += ["http://localhost:5173", "http://127.0.0.1:5173"]

# Render sets this to the app's public hostname (xyz.onrender.com).
RENDER_HOST = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_HOST:
    ALLOWED_HOSTS.append(RENDER_HOST)
    CSRF_TRUSTED_ORIGINS.append(f"https://{RENDER_HOST}")


# --- App-specific settings -------------------------------------------------

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
BOOTSTRAP_ADMIN_EMAIL = os.environ.get("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
ALLOWED_EMAIL_DOMAINS = [d.lower() for d in env_list("ALLOWED_EMAIL_DOMAINS", "ucsb.edu")]

# How long archived rides are kept before being deleted for good.
ARCHIVE_RETENTION_DAYS = int(os.environ.get("ARCHIVE_RETENTION_DAYS", "30"))

# Hours of operation (24-hour HH:MM). Rides can only be scheduled in this
# window; the ride form shows the same limits (see common/service_hours.py).
SERVICE_START = os.environ.get("SERVICE_START", "07:00")
SERVICE_END = os.environ.get("SERVICE_END", "19:00")

# Shown on rider pages ("Questions? Call dispatch"). Digits or any format.
DISPATCH_PHONE = os.environ.get("DISPATCH_PHONE", "")

# Who to contact about privacy questions (shown on /privacy).
PRIVACY_CONTACT_EMAIL = os.environ.get("PRIVACY_CONTACT_EMAIL", "")

# Backup sign-in passwords (usernames "dispatch" and "driver"), for when Google
# sign-in isn't working. Leave blank to keep an account switched off.
FALLBACK_DISPATCH_PASSWORD = os.environ.get("FALLBACK_DISPATCH_PASSWORD", "")
FALLBACK_DRIVER_PASSWORD = os.environ.get("FALLBACK_DRIVER_PASSWORD", "")

DEV_LOGIN = env_bool("DEV_LOGIN")
if DEV_LOGIN and not DEBUG:
    raise RuntimeError("DEV_LOGIN lets anyone sign in as anyone. It only works with DJANGO_DEBUG on.")


# --- Django ----------------------------------------------------------------

INSTALLED_APPS = [
    # Django's built-in admin at /django-admin/, stock behavior: only superusers
    # created with `createsuperuser` (developers) can sign in. Dispatchers use
    # the React admin pages and never get access to this.
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "whitenoise.runserver_nostatic",
    "django.contrib.staticfiles",
    "rest_framework",
    "accounts",
    "rides",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # API responses are per-person; browsers must not cache them (shared phones).
    "config.no_store.NoStoreApiMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}",
        conn_max_age=600,
        conn_health_checks=True,
    )
}

# Users only sign in with Google, so Django passwords are never set.
AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = os.environ.get("TIME_ZONE", "America/Los_Angeles")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # Hashed, compressed filenames in production; plain files in development
    # and tests, where collectstatic hasn't been run.
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        if DEBUG
        else "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    # Public phone lookup limits (rides/api_public.py): per visitor, per
    # phone number (so one person can't be looked up over and over, whatever
    # address it comes from), and overall (bounds trawling through numbers).
    "DEFAULT_THROTTLE_RATES": {
        "ride_lookup": "10/min",
        "ride_lookup_number": "20/hour",
        "ride_lookup_global": "600/hour",
    },
    # How many proxies sit in front of the app. Render has one, which adds the
    # visitor's real address to X-Forwarded-For; trusting only that entry
    # stops visitors from faking their address to dodge the per-visitor limit.
    # Locally (0) the direct connection address is used.
    "NUM_PROXIES": int(os.environ.get("TRUSTED_PROXY_COUNT", "1" if os.environ.get("RENDER_EXTERNAL_HOSTNAME") else "0")),
}

# Rate limits and lockouts count attempts in the cache. In production that's
# the database, so all server processes share one count and restarts don't
# reset it (start.sh creates the table). Locally, plain memory is fine.
CACHES = {
    "default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}
    if DEBUG
    else {"BACKEND": "django.core.cache.backends.db.DatabaseCache", "LOCATION": "cache_table"}
}

# Stay signed in for two weeks so drivers aren't re-signing in every shift.
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14

# Google's sign-in popup needs to talk back to this page. Django's default
# ("same-origin") blocks that.
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups"

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
    SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_CONTENT_TYPE_NOSNIFF = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
