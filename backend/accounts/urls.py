from django.urls import path

from . import views

urlpatterns = [
    path("session/", views.session),
    path("google/", views.google_sign_in),
    path("dev/", views.dev_sign_in),
    path("sign-out/", views.sign_out),
]
