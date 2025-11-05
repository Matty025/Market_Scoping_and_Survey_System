import React from "react";
import { NavLink } from "react-router-dom";
import "./Sidebar.css";

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">MRSSS Admin</h2>
      <nav className="sidebar-nav">
        <NavLink to="/admin/dashboard" className="sidebar-link">📊 Dashboard</NavLink>
        <NavLink to="/admin/manage-accounts" className="sidebar-link">👥 Manage Accounts</NavLink>
        <NavLink to="/admin/market" className="sidebar-link">🛒 Market</NavLink>
        <NavLink to="/admin/reports" className="sidebar-link">📑 Reports</NavLink>
        <NavLink to="/admin/settings" className="sidebar-link">⚙️ Settings</NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
