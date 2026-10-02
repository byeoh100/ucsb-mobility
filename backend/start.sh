#!/bin/sh
# Runs each time the container starts.
set -e
python manage.py migrate --noinput
exec gunicorn config.wsgi \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --access-logfile -
