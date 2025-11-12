import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";

// Auth pages
import RegisterPage from "./pages/Auth/RegisterPage";
import LoginPage from "./pages/Auth/LoginPage";

// Admin layout and pages
import AdminLayout from "./layout/AdminLayout";
import Dashboard from "./pages/Admin/Dashboard";
import ManageAccounts from "./pages/Admin/ManageAccounts";
import Market from "./pages/Admin/Market";
import MarketSuppliers from "./pages/Admin/MarketSuppliers";
import Reports from "./pages/Admin/Reports";
import Settings from "./pages/Admin/Settings";

// Supplier layout and pages
import SupplierLayout from "./layout/SupplierLayout";
import SupplierDashboard from "./pages/Supplier/Dashboard";
import SupplierMarket from "./pages/Supplier/Market";
import SupplierProfile from "./pages/Supplier/Profile";
import SupplierReports from "./pages/Supplier/Reports";
import SupplierUploadProducts from "./pages/Supplier/UploadProducts";

import BuyerLayout from "./layout/BuyerLayout";
import BuyerDashboard from "./pages/Buyer/Dashboard";
import BuyerMarket from "./pages/Buyer/Market";

function App() {
  // 👇 always track live role updates
  const [userRole, setUserRole] = useState(sessionStorage.getItem("userRole") || "");

  useEffect(() => {
    const handleStorageChange = () => {
      const role = sessionStorage.getItem("userRole") || "";
      setUserRole(role);
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return (
    <Routes>
      {/* ===== Auth Routes ===== */}
      <Route path="/" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* ===== Admin Layout ===== */}
      <Route
        path="/admin"
        element={
          userRole === "admin" ? <AdminLayout /> : <Navigate to="/" replace />
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="manage-accounts" element={<ManageAccounts />} />
        <Route path="market" element={<Market />} />
        <Route path="market-suppliers" element={<MarketSuppliers />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* ===== Supplier Layout ===== */}
      <Route
        path="/supplier"
        element={
          userRole === "supplier" ? (
            <SupplierLayout />
          ) : (
            <Navigate to="/" replace />
          )
        }
      >
        <Route path="dashboard" element={<SupplierDashboard />} />
        <Route path="market" element={<SupplierMarket />} />
        <Route path="upload-products" element={<SupplierUploadProducts />} />
        <Route path="reports" element={<SupplierReports />} />
        <Route path="profile" element={<SupplierProfile />} />
      </Route>

{/* ===== Buyer Routes ===== */}
      <Route
        path="/buyer"
        element={
          userRole === "buyer" ? (
            <BuyerLayout />
          ) : (
            <Navigate to="/" replace />
          )
        }
        >
        <Route path="dashboard" element={<BuyerDashboard />} />
        <Route path="market" element={<BuyerMarket />} />
      </Route>


      {/* ===== Catch-All Fallback ===== */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;