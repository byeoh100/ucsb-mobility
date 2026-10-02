import { Navigate, Route, Routes } from "react-router";
import DriversPage from "./admin/drivers/DriversPage.jsx";
import Placeholder from "./admin/Placeholder.jsx";
import RequireRole from "./auth/RequireRole.jsx";
import DriverHome from "./driver/DriverHome.jsx";
import AdminLayout from "./layouts/AdminLayout.jsx";
import Home from "./pages/Home.jsx";
import NotFound from "./pages/NotFound.jsx";
import SignIn from "./pages/SignIn.jsx";

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Home />} />
      <Route path="/sign-in" element={<SignIn />} />

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
        <Route path="rides" element={<Placeholder title="Rides">Today's rides will appear here.</Placeholder>} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="archive" element={<Placeholder title="Archive">Archived rides will appear here.</Placeholder>} />
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
  );
}
