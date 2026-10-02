import { useAuth } from "../auth/AuthProvider.jsx";
import MobileLayout from "../layouts/MobileLayout.jsx";

// Placeholder for the driver profile, built after the admin profile.
export default function DriverHome() {
  const { user, signOut } = useAuth();
  return (
    <MobileLayout
      title="Cart Dispatch"
      actions={<button className="button-quiet" onClick={signOut}>Sign out</button>}
    >
      <div className="stack">
        <h1>Driver view</h1>
        <p className="muted">Signed in as {user.email}. Your rides will show up here.</p>
      </div>
    </MobileLayout>
  );
}
