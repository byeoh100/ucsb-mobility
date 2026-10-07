"""Tell browsers never to keep copies of API responses.

Every /api/ response is about one person: who's signed in, their rides, a
rider's page. Drivers share phones, so a copy kept by the browser (Safari is
the most eager about this) could show the next driver the last driver's
account or rides. "no-store" means the browser always asks the server.
"""

from django.utils.cache import add_never_cache_headers


class NoStoreApiMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            add_never_cache_headers(response)  # no-cache, no-store, must-revalidate, private
        return response
