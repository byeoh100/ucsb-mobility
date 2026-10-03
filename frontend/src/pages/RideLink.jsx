import { useParams } from "react-router";
import MobileLayout from "../layouts/MobileLayout.jsx";

// The rider's page for one ride (/r/<token>). Built in a later part; this is
// where dispatch's "Open" and "Copy" links point.
export default function RideLink() {
  const { token } = useParams();
  return (
    <MobileLayout title="Cart Dispatch">
      <div className="stack">
        <h1>Your ride</h1>
        <p className="muted">The ride page is coming soon.</p>
        <p className="hint">Ride link: {token}</p>
      </div>
    </MobileLayout>
  );
}
