import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { Toaster } from 'react-hot-toast'; // 💡 IMPORTED THE TOASTER

// Auth pages
import RegisterPage from "./pages/Auth/RegisterPage";
import LoginPage from "./pages/Auth/LoginPage";
import VerifyEmailPage from "./pages/Auth/VerifyEmail";

// Admin layout and pages
import AdminLayout from "./layout/AdminLayout";
import Dashboard from "./pages/Admin/Dashboard";
import ManageAccounts from "./pages/Admin/ManageAccounts";
import Market from "./pages/Admin/Market";
import MarketSuppliers from "./pages/Admin/MarketSuppliers";
import SupplierActionHistory from "./pages/Admin/SupplierActionHistory";
import Reports from "./pages/Admin/Reports";
import Settings from "./pages/Admin/Settings";
import AnnouncementDetail from "./pages/Admin/AnnouncementDetail";

// Supplier layout and pages
import SupplierLayout from "./layout/SupplierLayout";
import SupplierDashboard from "./pages/Supplier/Dashboard";
import SupplierMarket from "./pages/Supplier/Market";
import SupplierProfile from "./pages/Supplier/Profile";
import SupplierItemHealth from "./pages/Supplier/ItemHealth";
import SupplierUploadProducts from "./pages/Supplier/UploadProducts";

// Buyer layout and pages
import BuyerLayout from "./layout/BuyerLayout";
import BuyerDashboard from "./pages/Buyer/Dashboard";
import BuyerMarket from "./pages/Buyer/Market";
import BuyerProfile from "./pages/Buyer/Profile";

// AppContent component to use context inside provider
function AppContent() {
  const { userRole, logout } = useAuth();

  return (
    <>
      {/* 🚀 FIX: The Toaster component must be rendered high in the tree 
          to listen to toast calls from anywhere in the application (like AddProductForm). 
          We place it here, outside the Routes, but inside the AppContent. */}
      <Toaster position="top-right" reverseOrder={false} />

      <Routes>
        {/* Auth Routes */}
        <Route path="/" element={userRole ? <Navigate to={`/${userRole}/dashboard`} replace /> : <LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-email/:token" element={<VerifyEmailPage />} />

        {/* Admin Routes */}
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout onLogout={logout} />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="announcements/:id" element={<AnnouncementDetail />} />
          <Route path="manage-accounts" element={<ManageAccounts />} />
          <Route path="market" element={<Market />} />
          <Route path="market-suppliers" element={<MarketSuppliers />} />
          <Route path="supplier-action-history" element={<SupplierActionHistory />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        {/* Supplier Routes */}
        <Route
          path="/supplier/*"
          element={
            <ProtectedRoute requiredRole="supplier">
              <SupplierLayout onLogout={logout} />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<SupplierDashboard />} />
          <Route path="market" element={<SupplierMarket />} />
          <Route path="upload-products" element={<SupplierUploadProducts />} />
          <Route path="item-health" element={<SupplierItemHealth />} />
          <Route path="profile" element={<SupplierProfile />} />
        </Route>

        {/* Buyer Routes */}
        <Route
          path="/buyer/*"
          element={
            <ProtectedRoute requiredRole="buyer">
              <BuyerLayout onLogout={logout} />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<BuyerDashboard />} />
          <Route path="market" element={<BuyerMarket />} />
          <Route path="profile" element={<BuyerProfile />} />
        </Route>

        {/* Catch-All */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;