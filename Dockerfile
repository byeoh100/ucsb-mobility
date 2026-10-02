# One image with both halves of the app.
# Stage 1 builds the React app with Node; stage 2 runs Django and serves it.

FROM node:22-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build    # writes to ../backend/frontend_dist

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt
COPY backend/ .
COPY --from=frontend /src/backend/frontend_dist ./frontend_dist
# A throwaway key is fine; nothing is signed during collectstatic.
RUN DJANGO_SECRET_KEY=collectstatic-only python manage.py collectstatic --noinput
RUN chmod +x start.sh && useradd --create-home appuser
USER appuser
CMD ["./start.sh"]
