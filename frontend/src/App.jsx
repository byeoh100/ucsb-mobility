import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import ArchivePage from "./admin/archive/ArchivePage.jsx";
import DriversPage from "./admin/drivers/DriversPage.jsx";
import RidesPage from "./admin/rides/RidesPage.jsx";
import RequireRole from "./auth/RequireRole.jsx";
import DriverHome from "./driver/DriverHome.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
import Home from "./pages/Home.jsx";
import NotFound from "./pages/NotFound.jsx";
import Privacy from "./pages/Privacy.jsx";
import RideLink from "./pages/RideLink.jsx";
import SignIn from "./pages/SignIn.jsx";

// Start each new page at the top (the router keeps the old scroll position
// otherwise, e.g. tapping "Privacy" at the bottom of a long page).
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
    <ScrollToTop />
    <Routes>
      {/* Public */}
      <Route path="/" element={<Home />} />
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/r/:token" element={<RideLink />} />
      <Route path="/privacy" element={<Privacy />} />

      {/* Admin profile (desktop) */}
      <Route
        path="/admin"
        element={
          <RequireRole roles={["admin"]}>
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route index element={<Navigate to="rides" replace />} />
        <Route path="rides" element={<RidesPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="archive" element={<ArchivePage />} />
      </Route>

      {/* Driver profile (mobile) */}
      <Route
        path="/driver"
        element={
          <RequireRole roles={["driver"]}>
            <DriverHome />
          </RequireRole>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
}
