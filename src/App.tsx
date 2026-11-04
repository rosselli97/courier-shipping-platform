import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import Couriers from "@/pages/Couriers";
import Tracking from "@/pages/Tracking";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ResellerDashboard from "@/pages/ResellerDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminNewShipment from "@/pages/AdminNewShipment";
import AdminShipments from "@/pages/AdminShipments";
import AdminClients from "@/pages/AdminClients";
import AdminSearch from "@/pages/AdminSearch";
import AdminCharges from "@/pages/AdminCharges";
import AdminNotifications from "@/pages/AdminNotifications";
import AdminRateLists from "@/pages/AdminRateLists";
import AddressBook from "@/pages/AddressBook";
import Support from "@/pages/Support";
import Notifications from "@/pages/Notifications";
import { RequireAuth, RequireRole } from "@/components/DashboardShell";

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/spedisci" element={<Couriers />} />
        <Route path="/traccia/:code" element={<Tracking />} />
        <Route path="/login" element={<Login />} />
        <Route path="/registrati" element={<Signup />} />
        <Route path="/notifiche" element={<RequireAuth><Notifications /></RequireAuth>} />
        <Route path="/dashboard" element={<RequireRole role="reseller"><ResellerDashboard /></RequireRole>} />
        <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
        <Route path="/admin/nuova-spedizione" element={<RequireRole role="admin"><AdminNewShipment /></RequireRole>} />
        <Route path="/dashboard/rubrica" element={<RequireRole role="reseller"><AddressBook role="reseller" /></RequireRole>} />
        <Route path="/dashboard/assistenza" element={<RequireRole role="reseller"><Support role="reseller" /></RequireRole>} />
        <Route path="/admin/assistenza" element={<RequireRole role="admin"><Support role="admin" /></RequireRole>} />
        <Route path="/admin/rubrica" element={<RequireRole role="admin"><AddressBook role="admin" /></RequireRole>} />
        <Route path="/admin/spedizioni" element={<RequireRole role="admin"><AdminShipments /></RequireRole>} />
        <Route path="/admin/clienti" element={<RequireRole role="admin"><AdminClients /></RequireRole>} />
        <Route path="/admin/cerca" element={<RequireRole role="admin"><AdminSearch /></RequireRole>} />
        <Route path="/admin/notifiche" element={<RequireRole role="admin"><AdminNotifications /></RequireRole>} />
        <Route path="/admin/addebiti" element={<RequireRole role="admin"><AdminCharges /></RequireRole>} />
        <Route path="/admin/listini" element={<RequireRole role="admin"><AdminRateLists /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors />
    </>
  );
}
