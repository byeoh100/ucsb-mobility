import { Link } from "react-router";
import { useAuth } from "../auth/AuthProvider.jsx";
import { formatPhone } from "../lib/phone.js";

// Public privacy policy (/privacy), linked from Google's consent screen.
// Written to match what the app actually does; if the app changes, update
// this page too. Have the program (and UCSB, if required) review the wording.
const LAST_UPDATED = "October 10, 2026";

export default function Privacy() {
  const { config } = useAuth();
  const retention = config.archive_retention_days;
  const phone = config.dispatch_phone?.replace(/\D/g, "").slice(-10);
  const email = config.privacy_contact_email;

  return (
    <div className="doc-page">
      <article className="doc">
        <p className="doc-back">
          <Link to="/">← UCSB Mobility Tracker</Link>
        </p>
        <h1>Privacy Policy</h1>
        <p className="muted">Last updated {LAST_UPDATED}</p>

        <p>
          UCSB Mobility Tracker coordinates golf cart rides for UC Santa Barbara students who need transportation to class.
          This page explains what information the app uses, who can see it, and how long it's kept.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Google sign-in.</strong> When staff or drivers sign in with Google, the app receives only your
            name and email address. It can't access your Gmail, Drive, contacts, calendar, or any other Google data,
            and it never sees your password.
          </li>
          <li>
            <strong>Ride information.</strong> Dispatch enters each rider's name, phone number, UCSB email (optional), pickup
            time, and pickup and drop-off locations, either by hand or by importing the program's ride request form
            (including any mobility equipment the rider listed). Eligibility is verified separately, outside this app.
          </li>
          <li>
            <strong>Ride notes (optional).</strong> Anything the rider adds when requesting a ride, such as where to
            meet or what help they need getting into the cart. Please include only what the driver needs to know.
          </li>
          <li>
            <strong>Map pins (optional).</strong> Riders may mark their pickup and drop-off spots on the campus map.
          </li>
          <li>
            <strong>Ride progress.</strong> When a driver starts a ride (it's then "On the way"), when they mark it complete (if
            they do), and whether the rider confirmed they'll be there.
          </li>
          <li>
            <strong>Driver location.</strong> Only while a driver has a ride on the way, their phone shares its
            GPS position about every 10 seconds, so the rider can see them coming. Only the most recent position is
            kept, and it's deleted within a day. Location is never collected from riders.
          </li>
          <li>
            <strong>Cookies and browser storage.</strong> A sign-in cookie that keeps you signed in, a security cookie
            that protects forms, and display preferences (like hiding completed rides) saved in your own browser. No
            advertising, analytics, or tracking cookies.
          </li>
          <li>
            <strong>Server logs.</strong> Like most websites, our hosting provider keeps standard server logs, such as
            IP addresses and the pages requested, for a limited time to run and secure the service.
          </li>
        </ul>

        <h2>Who can see it</h2>
        <ul>
          <li>
            <strong>Dispatch staff</strong> can see all ride information, every ride's progress, and which ride each
            driver is on, with their position on the campus map.
          </li>
          <li>
            <strong>Drivers</strong> can see every ride's time, rider name, locations, and map pins, so they can
            coordinate. Only for their own rides can they see the rider's phone number, email, notes, ride link,
            and progress.
          </li>
          <li>
            <strong>Anyone with a ride's link</strong> can see that ride's time, locations, and map pins. From 20
            minutes before pickup until the ride is over, the link also shows the ride's status, the driver's first
            name, and the driver's position on the campus map. Links don't show the rider's name, phone number, or
            email, and they stop working once the ride is over and it's 20 minutes past pickup (at most an hour after
            pickup). Please don't share your link.
          </li>
          <li>
            <strong>Phone number lookup.</strong> Entering a phone number on the home page shows the times and
            locations of that number's upcoming rides, with links to them. Lookups are rate-limited.
          </li>
        </ul>
        <p>
          A driver's position is only ever shown as a point on the campus map; exact GPS coordinates are never
          displayed to anyone.
        </p>

        <h2>What we don't do</h2>
        <p>
          We don't sell your information, use it for advertising, or share it with anyone outside the program, other
          than the services that run the app: our hosting provider (which stores the app and its database) and Google
          (for sign-in).
        </p>

        <h2>How long it's kept</h2>
        <ul>
          <li>
            Rides move to an archive at 8:00 AM the morning after, and are permanently deleted {retention} days after
            that.
          </li>
          <li>Drivers' location is deleted within a day.</li>
          <li>
            Your sign-in record (name and email) is kept so you can sign in again. Ask us if you'd like it removed.
          </li>
        </ul>

        <h2>Your choices</h2>
        <ul>
          <li>
            Drivers can decline to share location in their browser. The ride still works; the rider just won't see
            the driver on the map.
          </li>
          <li>Map pins are optional and can be changed or cleared on the ride page until the ride ends.</li>
          <li>To correct or remove your information, contact us below.</li>
        </ul>

        <h2>Contact</h2>
        <p>
          Questions about this policy or your information:{" "}
          {email && <a href={`mailto:${email}`}>{email}</a>}
          {email && phone && " or "}
          {phone && <a href={`tel:+1${phone}`}>{formatPhone(phone)}</a>}
          {!email && !phone && "contact the program's dispatch office"}.
        </p>

        <h2>Changes</h2>
        <p>If this policy changes, we'll update this page and the date at the top.</p>
      </article>
    </div>
  );
}
