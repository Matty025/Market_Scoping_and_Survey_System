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

// (Optional placeholders for future roles)
import SupplierDashboard from "./pages/Supplier/SupplierDashboard";
import TeacherDashboard from "./pages/Teacher/TeacherDashboard";

function App() {
  const userRole = localStorage.getItem("userRole");

  return (
    <Routes>
      {/* ===== Auth Routes ===== */}
      <Route path="/" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* ===== Admin Layout & Nested Routes ===== */}
      <Route
        path="/admin"
        element={
          userRole === "admin" ? (
            <AdminLayout />
          ) : (
            <Navigate to="/" replace />
          )
        }
      >
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="manage-accounts" element={<ManageAccounts />} />
        <Route path="market" element={<Market />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* ===== Supplier Layout (optional) ===== */}
      <Route
        path="/supplier/dashboard"
        element={
          userRole === "supplier" ? (
            <SupplierDashboard />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      {/* ===== Teacher Layout (optional) ===== */}
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

      {/* ===== Fallback ===== */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
