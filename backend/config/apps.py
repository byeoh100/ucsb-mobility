from django.contrib.admin.apps import AdminConfig


class DispatchAdminConfig(AdminConfig):
    default_site = "config.admin_site.DispatchAdminSite"
