import React from "react";
import { NavLink, useNavigate } from "react-router-dom";  // Added useNavigate for programmatic redirect
import { FaChevronLeft, FaSignOutAlt } from "react-icons/fa";  // Added FaSignOutAlt for logout icon
import logo from "../assets/Logo.png";
import "./Sidebar.css";

const Sidebar = ({ isCollapsed, onToggle }) => {
  const navigate = useNavigate();  // Hook for navigation

  // Logout handler: Clear auth data and redirect
  const handleLogout = () => {
    // Example: Clear auth token (adjust based on your auth setup)
    localStorage.removeItem('authToken');  // Or sessionStorage, or call an API
    // Optional: Add confirmation dialog
    if (window.confirm('Are you sure you want to logout?')) {
      navigate('/Auth/loginpage');  // Redirect to login
    }
  };

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      {/* Toggle button in top-right corner */}
      <button className="sidebar-toggle-btn" onClick={onToggle} title={isCollapsed ? "Open Sidebar" : "Close Sidebar"}>
        <FaChevronLeft className={`toggle-icon ${isCollapsed ? "rotated" : ""}`} />
      </button>

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

      {/* Logout Button at the bottom */}
      <div className="sidebar-footer">
        <button className="sidebar-logout-btn" onClick={handleLogout} title="Logout">
          <FaSignOutAlt />
          {!isCollapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;