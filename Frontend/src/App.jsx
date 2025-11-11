import { Routes, Route, Navigate } from "react-router-dom";

// Auth pages
import RegisterPage from "./pages/Auth/RegisterPage";
import LoginPage from "./pages/Auth/LoginPage";

// Admin layout and pages
import AdminLayout from "./layout/AdminLayout";
import Dashboard from "./pages/Admin/Dashboard";
import ManageAccounts from "./pages/Admin/ManageAccounts";
import Market from "./pages/Admin/Market";
import Reports from "./pages/Admin/Reports";
import Settings from "./pages/Admin/Settings";

// Supplier layout and pages
import SupplierLayout from "./layout/SupplierLayout";
import SupplierDashboard from "./pages/Supplier/Dashboard";
import SupplierMarket from "./pages/Supplier/Market";
import SupplierProfile from "./pages/Supplier/Profile";
import SupplierReports from "./pages/Supplier/Reports";
import SupplierUploadProducts from "./pages/Supplier/UploadProducts";

// Teacher pages
import TeacherDashboard from "./pages/Teacher/TeacherDashboard";

function App() {
  const userRole =
    sessionStorage.getItem("userRole") || localStorage.getItem("userRole");

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


      {/* ===== Teacher Routes ===== */}
      <Route
        path="/teacher/dashboard"
        element={
          userRole === "teacher" ? (
            <TeacherDashboard />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      {/* ===== Catch-All Fallback ===== */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
