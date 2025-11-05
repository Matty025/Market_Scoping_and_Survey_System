import "./App.css";
import { Routes, Route } from "react-router-dom";
import LoginPage from "./pages/Auth/LoginPage";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import TeacherDashboard from "./pages/Teacher/TeacherDashboard";
import SupplierDashboard from "./pages/Supplier/SupplierDashboard";
import RegisterPage from "./pages/Auth/RegisterPage";

function App() {
  return (
    <Routes>
      {/* Default login route */}
      <Route path="/" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} /> {/* ✅ new route */}

      {/* Dashboards */}
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/teacher" element={<TeacherDashboard />} />
      <Route path="/supplier" element={<SupplierDashboard />} />
    </Routes>
  );
}

export default App;
