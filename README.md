# UCSB Mobility Tracker

Ride dispatch for the campus golf cart program. Django + React, deployed as one app.

## What it does

- **Sign-in:** Google sign-in with a UCSB email, plus two backup accounts (below).
- **Dispatch** (`/admin`)
  - **Rides:** a day view with a date switcher, a sortable color-coded table and an unassigned bar. Add, edit and delete rides, including repeating rides.
  - **Drivers:** add and edit drivers, set their weekly shifts, and see live locations.
  - **Dispatchers:** add and remove dispatchers.
  - **Archive:** past days' rides, read-only.
- **Drivers** (`/driver`)
  - Current rides with several passengers at once, plus Up next and Done.
  - On the way / Mark complete, each with an undo.
  - Tap to call, and a campus map with the rider's pins.
  - Shares the driver's location while a ride is on the way.
- **Riders**
  - Look up rides by phone number on the home page.
  - Follow a ride on its own page (`/r/<token>`): status, drop-offs away, the driver's dot, a 👍, and optional map pins.

## Roles

Anyone with a UCSB email can sign in through Google. Their role comes from their email:

- **Admin** (on the admin list): every page; lands on `/admin/rides`.
- **Driver** (on the driver list): the driver view; lands on `/driver`.
- **Rider** (everyone else): ride lookup at `/`.

Changes to the lists take effect immediately, with no need to sign out. Only emails in `ALLOWED_EMAIL_DOMAINS` can be added (default `ucsb.edu`, which also covers `umail.ucsb.edu`).

**The first admin:** set `BOOTSTRAP_ADMIN_EMAIL` to your email. When you first sign in while the admin list is empty, you're added to it. After that, the setting does nothing.

## Layout

```
backend/
  config/       settings, URLs, React-serving view
  accounts/     admin list, driver list, roles, shifts, sign-in and drivers APIs
  rides/        rides, status and archive rules, rider pages, location, APIs
  common/       shared helpers (phone numbers, hours of operation)
frontend/src/
  auth/         sign-in state, role guard, Google button
  layouts/      AdminLayout (desktop) and MobileLayout (phone column)
  pages/        ride lookup home, sign-in, rider page, privacy, not found
  admin/        dispatch pages: rides, drivers, dispatchers, archive
  driver/       driver view
  components/   shared pieces (modals, campus map, phone and time inputs)
  lib/          small shared helpers (phone formatting, dates/times, shifts)
```

| URL | What |
|---|---|
| `/` | ride lookup by phone number (public) |
| `/sign-in` | sign-in |
| `/admin/rides`, `/admin/drivers`, `/admin/dispatchers`, `/admin/archive` | dispatch pages |
| `/driver` | driver view |
| `/r/<token>` | a rider's page for one ride (public; the token is the key) |
| `/privacy` | privacy policy (public; linked from Google's consent screen) |
| `/api/auth/session/` | who's signed in, and their role |
| `/api/drivers/`, `/api/drivers/<id>/shifts/` | driver list, add, edit, remove, weekly shifts (admins) |
| `/api/dispatchers/` | dispatcher list, add, remove; never the last one (admins) |
| `/api/rides/?date=YYYY-MM-DD` | one day's rides (drivers and admins read; admins write) |
| `/api/rides/<id>/start/`, `/unstart/`, `/complete/`, `/reopen/` | the driver's ride buttons (assigned driver) |
| `/api/location/` | the driver's phone reporting GPS (only while a ride is on the way) |
| `/api/archive/days/`, `/api/archive/?date=` | archived days and their rides, read-only (admins) |
| `/api/r/<token>/`, `/confirm/`, `/pins/` | rider page data, thumbs up, pins (public) |
| `/api/lookup/?phone=` | rides by phone number (public, rate-limited) |
| `/django-admin/` | Django's raw data editor (developer superusers only) |

## Run it locally

You need Python 3.12+ and Node 20.19+ (or 22.12+).

**Backend** (terminal 1):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                   # Windows: copy .env.example .env
```

Open `backend/.env` and set `BOOTSTRAP_ADMIN_EMAIL` to your email. Then:

```bash
python manage.py migrate
python manage.py runserver
```

**Frontend** (terminal 2):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and use **Development sign-in** with your bootstrap email to become admin. To try other roles, add a driver on the Drivers page, then sign in as that email (driver) or any other email (rider). `DEV_LOGIN` lets anyone sign in as anyone, so it only works with `DJANGO_DEBUG` on.

`.env` is git-ignored and only for your machine. In production, set the same variables on the host (Render's dashboard) instead.

## Backup sign-in

If Google sign-in isn't working, two backup accounts can sign in with a username and password under **Can't sign in with Google?** on the sign-in page:

| Username | Acts as | Password setting |
|---|---|---|
| `dispatch` | admin | `FALLBACK_DISPATCH_PASSWORD` |
| `driver` | a driver named "Backup driver" | `FALLBACK_DRIVER_PASSWORD` |

- An account works only while its password is set. Clearing the setting turns it off and signs out anyone using it.
- On the live site, use long random passwords: these accounts can see rider details and driver locations.
- 10 wrong passwords lock that username for 5 minutes.
