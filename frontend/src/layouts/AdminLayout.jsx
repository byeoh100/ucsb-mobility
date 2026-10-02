import { NavLink, Outlet } from "react-router";
import { useAuth } from "../auth/AuthProvider.jsx";

// Desktop shell for the admin profile: top bar with section tabs.
// Each admin page renders inside <Outlet />.
const SECTIONS = [
  { to: "/admin/rides", label: "Rides" },
  { to: "/admin/drivers", label: "Drivers" },
  { to: "/admin/archive", label: "Archive" },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();

  return (
    <div className="admin">
      <header className="admin-bar">
        <span className="brand">Cart Dispatch</span>
        <nav aria-label="Admin sections">
          {SECTIONS.map((s) => (
            <NavLink key={s.to} to={s.to} className="tab">
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="account">
          <span className="muted">{user.email}</span>
          <button className="button-quiet" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
