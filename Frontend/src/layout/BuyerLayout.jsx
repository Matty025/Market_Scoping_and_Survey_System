
import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import Footer from "../components/Footer";
import "./BuyerLayout.css"; // Reuse admin layout styles (ensure this file exists or copy from AdminLayout.css)

const BuyerLayout = () => {  // <-- Fixed: Component name now matches export
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className={`admin-layout ${!isSidebarOpen ? "collapsed" : ""}`}>
      {/* Sidebar (pass role="buyer" to customize for buyers) */}
      <Sidebar isCollapsed={!isSidebarOpen} onToggle={toggleSidebar} role="buyer" />

      <div className="admin-main">
        {/* Reuse AdminNavbar but pass a buyer-specific title */}
        <AdminNavbar title="Buyer" />

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

export default BuyerLayout;  // <-- Now matches the component name
