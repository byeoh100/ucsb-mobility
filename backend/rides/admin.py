from django.contrib import admin

from .models import DriverLocation, Ride


@admin.register(Ride)
class RideAdmin(admin.ModelAdmin):
    list_display = ["pickup_time", "rider_name", "pickup_name", "dropoff_name", "driver"]
    list_filter = ["driver"]
    date_hierarchy = "pickup_time"
    search_fields = ["rider_name", "rider_phone", "rider_email", "pickup_name", "dropoff_name"]
    readonly_fields = ["link_token", "created_at", "updated_at"]


@admin.register(DriverLocation)
class DriverLocationAdmin(admin.ModelAdmin):
    list_display = ["driver", "lat", "lng", "accuracy_m", "updated_at"]
