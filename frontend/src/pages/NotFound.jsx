import { Link } from "react-router";
import MobileLayout from "../layouts/MobileLayout.jsx";

export default function NotFound() {
  return (
    <MobileLayout title="UCSB Mobility Tracker">
      <div className="stack">
        <h1>Page not found</h1>
        <Link to="/" className="button">Go to ride lookup</Link>
      </div>
    </MobileLayout>
  );
}
