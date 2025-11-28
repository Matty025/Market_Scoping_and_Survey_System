import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import Footer from "../components/Footer";
import "./AdminLayout.css";

const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Initialize from persisted sidebar state
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
    <div className={`admin-layout ${!isSidebarOpen ? 'collapsed' : ''}`}>  
      <Sidebar isCollapsed={!isSidebarOpen} onToggle={toggleSidebar} role="admin" />  

      <div className="admin-main">
        <AdminNavbar onToggle={toggleSidebar} isCollapsed={!isSidebarOpen} />  
        <div className="admin-content">
          <Outlet />
        </div>
        <Footer />
      </div>

      {/* Optional overlay to close sidebar when clicked */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar}></div>
      )}
    </div>
  );
};

export default AdminLayout;