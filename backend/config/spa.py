"""Serves the built React app for every URL that isn't the API or Django admin."""

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import ensure_csrf_cookie

NOT_BUILT = """<!doctype html><meta charset="utf-8"><title>Frontend not built</title>
<body style="font-family:system-ui;max-width:36rem;margin:3rem auto;line-height:1.5">
<h1>The React app hasn't been built</h1>
<p>For development, run <code>npm run dev</code> in <code>frontend/</code> and open
<a href="http://localhost:5173">localhost:5173</a>.</p>
<p>To serve it from Django, run <code>npm run build</code> in <code>frontend/</code> and restart.</p>
</body>"""


@ensure_csrf_cookie
def spa_index(request):
    index_file = settings.FRONTEND_DIST / "index.html"
    if not index_file.exists():
        return HttpResponse(NOT_BUILT, status=200 if settings.DEBUG else 503)
    response = HttpResponse(index_file.read_text(encoding="utf-8"))
    # index.html is never cached so new deploys show up immediately.
    # The JS/CSS it references have hashed filenames and cache normally.
    response["Cache-Control"] = "no-cache"
    return response
