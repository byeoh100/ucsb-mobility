#!/bin/sh
# Runs each time the container starts.
set -e
python manage.py migrate --noinput
python manage.py createcachetable   # shared counters for rate limits and lockouts

# Create the developer superuser for /django-admin/ from env vars, if set.
# Skipped once the account exists, so it's safe to leave the vars in place.
if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  python manage.py createsuperuser --noinput >/dev/null 2>&1 \
    && echo "Created developer account $DJANGO_SUPERUSER_USERNAME" \
    || echo "Developer account $DJANGO_SUPERUSER_USERNAME already exists"
fi

exec gunicorn config.wsgi \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --access-logfile -
