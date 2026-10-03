"""One-time cleanup.

Earlier versions gave Django staff/superuser flags to everyone on the admin
list when they signed in with Google. The Django admin now uses Django's
default rules (those flags are the gate), so clear them from every
Google-only account. Developer accounts made with `createsuperuser` have a
real password and are left alone.
"""

from django.contrib.auth.hashers import is_password_usable
from django.db import migrations


def revoke_google_account_staff(apps, schema_editor):
    User = apps.get_model("auth", "User")
    for user in User.objects.filter(is_staff=True) | User.objects.filter(is_superuser=True):
        if not is_password_usable(user.password):
            user.is_staff = False
            user.is_superuser = False
            user.save(update_fields=["is_staff", "is_superuser"])


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_driver_color_unique"),
        ("auth", "0012_alter_user_first_name_max_length"),
    ]
    operations = [migrations.RunPython(revoke_google_account_staff, migrations.RunPython.noop)]
