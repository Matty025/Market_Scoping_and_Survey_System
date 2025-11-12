// src/layout/SupplierLayout.jsx
import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import Footer from "../components/Footer";
import "./AdminLayout.css"; // reuse admin layout styles

const SupplierLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className={`admin-layout ${!isSidebarOpen ? "collapsed" : ""}`}>
      {/* Sidebar (pass role="supplier" to reuse Sidebar component) */}
      <Sidebar isCollapsed={!isSidebarOpen} onToggle={toggleSidebar} role="supplier" />

      <div className="admin-main">
        {/* Reuse AdminNavbar but pass a title */}
        <AdminNavbar title="Supplier" />

        <div className="admin-content">
          <Outlet />
        </div>

        <Footer />
      </div>

      {/* Optional overlay to close sidebar when clicked */}
      {isSidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}
    </div>
  );
};

export default SupplierLayout;
