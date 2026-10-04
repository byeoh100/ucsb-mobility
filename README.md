# Cart Dispatch

Ride dispatch for the campus golf cart program. Django + React, deployed as one app.

**Built so far:** Google sign-in, role lists, page shells, admin → Drivers (complete), and admin → Rides (day view with date switcher, sortable color-coded table, unassigned bar; add/edit form; delete from the edit dialog with confirmation), admin → Archive, and the driver view (My/All rides, Up next, On the way with Undo, tap-to-call, campus map with the rider's pins). Drivers share their location while a ride is on the way (shown as a dot on the campus map; dispatch sees it on the Drivers page). Riders find their ride by phone number on the home page and follow it on its rider page (`/r/<token>`): status, drop-offs away, the driver's dot, a 👍, and optional pins they drag onto the map.

## How roles work

Anyone can sign in with Google. Their role comes from their email:

| Role | Who | Lands on |
|---|---|---|
| Admin | email is on the admin list | `/admin/rides` |
| Driver | email is on the driver list | `/driver` |
| Rider | everyone else who signs in | `/` (ride lookup) |

Roles are checked on every request, so adding or removing someone from a list takes effect immediately, with no need to sign out and back in. Admins can open every page. Only emails in `ALLOWED_EMAIL_DOMAINS` (default `ucsb.edu`, which also covers `umail.ucsb.edu`) can be added to the lists.

**The first admin.** Set `BOOTSTRAP_ADMIN_EMAIL` to your email. The first time you sign in, while the admin list is empty, you're added to it. Once any admin exists, the variable does nothing, so it's safe to leave set.

## Layout

```
backend/
  config/       settings, URLs, React-serving view
  accounts/     admin list, driver list, roles, sign-in and drivers APIs, tests
  rides/        ride model, status and archive rules, rides + archive APIs, seed_demo, tests
  common/       shared helpers (phone number cleanup)
frontend/src/
  auth/         sign-in state, role guard, Google button
  layouts/      AdminLayout (desktop) and MobileLayout (phone column)
  pages/        ride lookup home, sign-in, not found
  admin/        admin pages (drivers/ is the first real one)
  lib/          small shared helpers (phone formatting, campus dates/times)
  driver/       driver view: DriverHome, RideCard, RideRow
```

| URL | What |
|---|---|
| `/` | ride lookup by phone number (public; lookup itself comes later) |
| `/sign-in` | Google sign-in |
| `/admin/rides`, `/admin/drivers`, `/admin/archive` | admin profile |
| `/driver` | driver profile |
| `/api/auth/session/` | who's signed in, and their role |
| `/api/drivers/` | driver list, add, edit, remove (admins only) |
| `/api/rides/?date=YYYY-MM-DD` | one day's rides (drivers and admins read; admins write) |
| `/api/rides/<id>/start/`, `/unstart/` | driver taps On the way / Undo (assigned driver, today only) |
| `/api/rides/<id>/complete/`, `/reopen/` | optional Mark complete / Reopen (assigned driver, ride on the way) |
| `/api/location/` | driver's phone reporting GPS (only accepted while a ride is on the way) |
| `/api/archive/days/`, `/api/archive/?date=` | archived days and their rides, read-only (admins) |
| `/privacy` | privacy policy (public; linked from Google's consent screen) |
| `/r/<token>` | a rider's page for one ride (public; the token is the key) |
| `/api/r/<token>/`, `/confirm/`, `/pins/` | rider page data, thumbs up, pins (public) |
| `/api/lookup/?phone=` | rides by phone number (public, 10 lookups/min per visitor) |
| `/django-admin/` | Django's raw data editor, developers only (see below) |

## Run it locally

You need Python 3.12+ and Node 20.19+ (or 22.12+).

**Backend** (terminal 1):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                   # Windows: copy .env.example .env
```

Open `backend/.env` and set `BOOTSTRAP_ADMIN_EMAIL` to your email. Django loads this file on every start, so there's nothing to re-paste. Then:

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

Open http://localhost:5173 and use **Development sign-in** with your bootstrap email to become admin. To try other roles, add a driver on the Drivers page, then sign in as that email (driver) or any other email (rider).

**Demo data:** `python manage.py seed_demo` adds five demo drivers and a day of rides (today, or `--date 2026-10-06`; `--clear` deletes all rides first). It only runs with `DJANGO_DEBUG` on.

`DEV_LOGIN` lets anyone sign in as anyone, so it refuses to run unless `DJANGO_DEBUG` is on.

**Tests:** `python manage.py test` in `backend/`.

`.env` is git-ignored and only for your machine. In production, set the same variables on the host instead (Render's dashboard), which take priority over any file.

## Campus map calibration

Driver locations are GPS; the map is a picture. `backend/rides/map_calibration.json` lists landmarks as *pixel position on the image* ↔ *GPS*, and `rides/geo.py` fits a scale + slight rotation + shift to them. It currently has 3 landmarks (about 5–15 m each), which is a starter calibration.

To improve it, add points at features you can pinpoint on the image, like path intersections or building corners. Spread them across the map, especially the east and south edges:

1. Find the pixel position on `frontend/src/assets/campus-map.jpg` (most image viewers show cursor coordinates).
2. Right-click the same spot in Google Maps to copy its latitude/longitude.
3. Add `{ "name", "x", "y", "lat", "lng" }` to `points`, then run `python manage.py map_calibration`. It reports each point's error and flags any that disagree with the rest. Restart the server to use the new fit.

The real-world test is walking around campus with the driver view open on a ride: the blue "You" dot should follow you.

**Testing on a real phone:** browsers only share location over HTTPS (or `localhost`). Opening your laptop's `http://192.168.x.x:5173` on a phone won't work; use the deployed site, or a tunnel like ngrok for development.

## Backup sign-in

If Google or UCSB sign-in isn't working, two backup accounts can sign in with a username and password on the sign-in page, under **Can't sign in with Google?**:

| Username | Acts as | Password setting |
|---|---|---|
| `dispatch` | admin (full dispatch access) | `FALLBACK_DISPATCH_PASSWORD` |
| `driver` | a driver named "Backup driver", which dispatch can assign rides to | `FALLBACK_DRIVER_PASSWORD` |

- **Off by default:** an account works only while its password is set. Clearing the setting switches it off and also cuts off anyone signed in with it.
- **Passwords live in settings, not code.** Simple ones are fine locally; on the live site use long, random passwords, since these accounts can see rider details and driver locations.
- After 10 wrong passwords, that username is locked for 5 minutes.
- The backup driver's profile is created on its first sign-in, with the first free color. Dispatch can rename it or change its color on the Drivers page.
- Backup accounts can't use `/django-admin/`, and don't affect the bootstrap admin.

## Developer access (`/django-admin/`)

Django's built-in admin is a raw database editor for developers. It uses Django's default rules: only **superuser** accounts, which sign in with a username and password. Google sign-in never grants access, so dispatchers (on the admin list) only ever see the React admin pages.

Create your developer account locally with:

```bash
python manage.py createsuperuser
```

On Render, set `DJANGO_SUPERUSER_USERNAME`, `DJANGO_SUPERUSER_EMAIL` and `DJANGO_SUPERUSER_PASSWORD`. `start.sh` creates the account on the next start, and skips it once it exists. Use a long, unique password; this page is on the public internet.

To give another developer access, create a superuser for them (or tick *Superuser status* on their account inside `/django-admin/`).

## Google sign-in setup

You need an OAuth client ID. There's no client secret, because the browser gets a signed token from Google and the server verifies it with Google's public keys. The console wording below may shift slightly over time.

1. Go to [Google Cloud Console](https://console.cloud.google.com), create a project (e.g. "Cart Dispatch").
2. Open **Google Auth Platform** (formerly "OAuth consent screen") and configure it: app name, support email, and audience **External**.
3. Under **Audience**, publish the app (**In production**). While it's in "Testing", only test users you list can sign in. The app only asks for basic profile and email, which doesn't require Google's verification review.
4. Under **Clients**, create a client of type **Web application**. Add these **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `http://localhost:8000`
   - `http://localhost`
   - your deployed URL, e.g. `https://cart-dispatch.onrender.com`
   No redirect URIs are needed.
5. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into `GOOGLE_CLIENT_ID` in `backend/.env`, and restart Django.
6. After deploying, fill in **Branding** in Google Auth Platform: **App home page** `https://<your-app>/` and **Privacy policy** `https://<your-app>/privacy`. Google requires real public addresses (not localhost); for an app that only asks for name and email, these are optional, but they make the consent screen trustworthy.

If the Google button says the origin isn't allowed, the exact URL in your address bar (scheme, host, and port) is missing from step 4. New origins can take a few minutes to start working.

## Deploy to Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. It creates the web app and a Postgres database from `render.yaml`.
3. When prompted, enter `GOOGLE_CLIENT_ID` and `BOOTSTRAP_ADMIN_EMAIL`.
4. Add your Render URL to the client's Authorized JavaScript origins (Google setup, step 4).
5. Open the site, sign in with your bootstrap email, and you're the first admin.

Pushes to your main branch redeploy automatically, and migrations run on each start.

Before real shifts depend on it, check Render's current pricing. Free web instances sleep when idle and wake slowly, and free databases expire, so move both to paid plans for the pilot.

**Custom domain:** add it in Render, then set `DJANGO_ALLOWED_HOSTS=rides.example.edu` and `DJANGO_CSRF_TRUSTED_ORIGINS=https://rides.example.edu`, and add it as a JavaScript origin in Google.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DJANGO_DEBUG` | local | `true` for development; unset in production |
| `DJANGO_SECRET_KEY` | production | long random string (Render generates it) |
| `DATABASE_URL` | production | Postgres URL; SQLite is used if unset |
| `GOOGLE_CLIENT_ID` | both | OAuth client ID |
| `BOOTSTRAP_ADMIN_EMAIL` | both | seeds the first admin |
| `ALLOWED_EMAIL_DOMAINS` | optional | list domains, comma-separated (default `ucsb.edu`) |
| `FALLBACK_DISPATCH_PASSWORD`, `FALLBACK_DRIVER_PASSWORD` | optional | backup sign-in passwords (blank = off) |
| `DEV_LOGIN` | local only | `true` shows the sign-in-as-anyone form |
| `DJANGO_SUPERUSER_USERNAME` / `_EMAIL` / `_PASSWORD` | production | creates your developer account for `/django-admin/` |
| `TIME_ZONE` | optional | default `America/Los_Angeles` |
| `DISPATCH_PHONE` | recommended | dispatch's number, shown on rider pages and the privacy policy |
| `PRIVACY_CONTACT_EMAIL` | recommended | contact for privacy questions, shown on `/privacy` |
| `ARCHIVE_RETENTION_DAYS` | optional | days archived rides are kept (default 30) |
| `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` | custom domains | see above |

## For later parts

- API views use `accounts.permissions.IsAdmin` or `IsDriverOrAdmin`.
- Phone numbers are stored as 10 digits (`common/phone.py`). `frontend/src/lib/phone.js` formats them as (805) - 555 - 0123, and `components/PhoneInput.jsx` is the typing-as-you-go input; reuse it for rider phones.
- Ride status is computed, never stored (`rides/status.py`): *completed* if the driver tapped the optional **Mark complete** (which can be undone with Reopen), 15 min after pickup, or once the same driver starts a later ride; *on the way* once `started_at` is set; otherwise *not confirmed*.
- Archiving is computed too (`rides/archive.py`): a day's rides leave the Rides page and become read-only at 8:00 AM the next morning. Rides older than `ARCHIVE_RETENTION_DAYS` are deleted by `purge_expired()`, which runs as the rides and archive pages load, so no scheduled job is needed. `seed_demo --date <past date>` fills the archive for testing.
- Map pins are optional and set by the rider on their ride page (later part). They're stored as fractions of the campus map image (`frontend/src/assets/campus-map.jpg`), not GPS, so dispatch's API only reads them.
- Ride times display in the campus time zone (`TIME_ZONE`, sent to the frontend in the session) regardless of the viewer's device.
- Ride progress is private: the API sends `status`, `rider_confirmed` and `started_at` only to dispatch and the ride's assigned driver (`RideSerializer.to_representation`). Other drivers get those fields as `null`, but still see who/when/where so they can arrange swaps.
- Rider page phases (`rides/rider_page.py`): more than 15 min before pickup it shows details and lets riders place pins; from 15 min before to 15 min after it's live (status, drop-offs away, driver's position, 👍 once the driver is on the way); once the driver starts their next ride it says the ride is complete; after the window the link shows nothing but "expired".
- The privacy policy (`frontend/src/pages/Privacy.jsx`) describes what the app actually does. If you change what's collected, who sees it, or how long it's kept, update it. The program (and UCSB, if required) should review the wording.
- Location privacy: phones send GPS only while their driver has a ride on the way; the server keeps just the latest fix per driver, deletes it after a day, and only shows it during that ride, and only ever as a position on the map image (raw GPS never leaves the server). The phone's screen is kept awake while sharing, since browsers pause GPS when it locks.
- `components/CampusMap.jsx` draws the campus image with the rider's pins (tips anchored exactly on the stored point); the rider page will reuse it.
- Styling follows UCSB's brand guidelines (brand.ucsb.edu): the digital color palette is defined once at the top of `frontend/src/styles.css` (use those variables, not new hex values), and the font is Nunito Sans, UCSB's approved web substitute for Avenir, served by the app itself (`@fontsource/nunito-sans`). The app uses UCSB colors and type but not UCSB logos or marks, which require approval from UCSB's brand office.
- `components/Modal.jsx` is the shared dialog for forms; `components/ConfirmDialog.jsx` wraps it for destructive actions (use it for ride deletion).
- Driver colors are the 12 presets in `accounts/models.py` (`DRIVER_COLORS`).
- New admin pages go in `frontend/src/admin/` and get a route under `/admin` in `App.jsx`.
