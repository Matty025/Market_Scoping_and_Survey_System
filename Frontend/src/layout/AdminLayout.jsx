import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import Footer from "../components/Footer";
import "./AdminLayout.css";

const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);  // Assuming false means collapsed (closed)

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className={`admin-layout ${!isSidebarOpen ? 'collapsed' : ''}`}>  
      <Sidebar isCollapsed={!isSidebarOpen} onToggle={toggleSidebar} />  

      <div className="admin-main">
        <AdminNavbar />  
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