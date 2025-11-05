import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import Footer from "../components/Footer";
import "./AdminLayout.css";

const AdminLayout = () => {
  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-main">
        <AdminNavbar />
        <div className="admin-content">
          <Outlet /> {/* This renders each admin page inside */}
        </div>
        <Footer />
      </div>
    </div>
  );
};

export default AdminLayout;
