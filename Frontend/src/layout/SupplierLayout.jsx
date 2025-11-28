// src/layout/SupplierLayout.jsx
import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import Footer from "../components/Footer";
import "./SupplierLayout.css"; // reuse admin layout styles

const SupplierLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebarCollapsed");
      if (stored !== null) {
        setIsSidebarOpen(!(stored === "true"));
      }
    } catch {}
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className={`admin-layout ${!isSidebarOpen ? "collapsed" : ""}`}>
      {/* Sidebar (pass role="supplier" to reuse Sidebar component) */}
      <Sidebar isCollapsed={!isSidebarOpen} onToggle={toggleSidebar} role="supplier" />

      <div className="admin-main">
        {/* Reuse AdminNavbar but pass a title and toggle */}
        <AdminNavbar title="Supplier" onToggle={toggleSidebar} isCollapsed={!isSidebarOpen} />

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
