from django.contrib import admin

from .models import AdminEmail, Driver


@admin.register(AdminEmail)
class AdminEmailAdmin(admin.ModelAdmin):
    list_display = ["email", "created_at"]
    search_fields = ["email"]


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ["name", "email", "phone", "color"]
    search_fields = ["name", "email"]
