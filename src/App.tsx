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
import AddressBook from "@/pages/AddressBook";
import Support from "@/pages/Support";
import TravelBox from "@/pages/TravelBox";
import { RequireRole } from "@/components/DashboardShell";

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
        <Route path="/dashboard" element={<RequireRole role="reseller"><ResellerDashboard /></RequireRole>} />
        <Route path="/admin" element={<RequireRole role="admin"><AdminDashboard /></RequireRole>} />
        <Route path="/admin/nuova-spedizione" element={<RequireRole role="admin"><AdminNewShipment /></RequireRole>} />
        <Route path="/dashboard/rubrica" element={<RequireRole role="reseller"><AddressBook role="reseller" /></RequireRole>} />
        <Route path="/dashboard/assistenza" element={<RequireRole role="reseller"><Support role="reseller" /></RequireRole>} />
        <Route path="/admin/assistenza" element={<RequireRole role="admin"><Support role="admin" /></RequireRole>} />
        <Route path="/admin/rubrica" element={<RequireRole role="admin"><AddressBook role="admin" /></RequireRole>} />
        <Route path="/admin/spedizioni" element={<RequireRole role="admin"><AdminShipments /></RequireRole>} />
        <Route path="/admin/travelbox" element={<RequireRole role="admin"><TravelBox /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors />
    </>
  );
}
