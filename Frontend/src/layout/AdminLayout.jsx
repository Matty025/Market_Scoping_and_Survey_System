import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import Footer from "../components/Footer";
import "./AdminLayout.css";

const AdminLayout = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleSidebar = () => setIsCollapsed(!isCollapsed);

  return (
    <div className={`admin-layout ${isCollapsed ? "collapsed" : ""}`}>
      <Sidebar isCollapsed={isCollapsed} />
      <div className="admin-main">
        <AdminNavbar onToggleSidebar={toggleSidebar} />
        <div className="admin-content">
          <Outlet />
        </div>
        <Footer />
      </div>
    </div>
  );
};

export default AdminLayout;
