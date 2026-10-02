import { useState } from "react";
import { Link } from "react-router";
import { homeForRole, useAuth } from "../auth/AuthProvider.jsx";
import MobileLayout from "../layouts/MobileLayout.jsx";

// Default page: riders look up their ride by phone number, no sign-in needed.
// The lookup itself is built in a later part; this is its placeholder.
export default function Home() {
  const { user, signOut } = useAuth();
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);

  let staffLink = null;
  if (user === null) {
    staffLink = <Link to="/sign-in" className="button-quiet">Sign in</Link>;
  } else if (user?.role === "rider") {
    staffLink = <button className="button-quiet" onClick={signOut}>Sign out</button>;
  } else if (user) {
    staffLink = (
      <Link to={homeForRole(user.role)} className="button-quiet">
        {user.role === "admin" ? "Dispatch" : "Driver view"}
      </Link>
    );
  }

  return (
    <MobileLayout title="Cart Dispatch" actions={staffLink}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <h1>Find your ride</h1>
        <label className="field">
          Phone number
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(805) 555-0123"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setSubmitted(false);
            }}
          />
        </label>
        <button type="submit" className="button" disabled={!phone.trim()}>
          Look up ride
        </button>
        {submitted && <p className="notice">Ride lookup isn't available yet.</p>}
      </form>
    </MobileLayout>
  );
}
