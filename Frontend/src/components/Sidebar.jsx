import React from "react";
import { NavLink } from "react-router-dom";
import logo from "../assets/Logo.png";
import "./Sidebar.css";

const Sidebar = ({ isCollapsed }) => {
  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <div className="sidebar-header">
        {/* Show logo + title only when sidebar is expanded */}
        {!isCollapsed && (
          <h2 className="sidebar-title">
            <img
              src={logo}
              alt="Logo"
              className="sidebar-logo-sdo"
            />
          </h2>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-nav">
        <NavLink to="/admin/dashboard" className="sidebar-link">
          📊 {!isCollapsed && "Dashboard"}
        </NavLink>
        <NavLink to="/admin/manage-accounts" className="sidebar-link">
          👥 {!isCollapsed && "Manage Accounts"}
        </NavLink>
        <NavLink to="/admin/market" className="sidebar-link">
          🛒 {!isCollapsed && "Market"}
        </NavLink>
        <NavLink to="/admin/reports" className="sidebar-link">
          📑 {!isCollapsed && "Reports"}
        </NavLink>
        <NavLink to="/admin/settings" className="sidebar-link">
          ⚙️ {!isCollapsed && "Settings"}
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
