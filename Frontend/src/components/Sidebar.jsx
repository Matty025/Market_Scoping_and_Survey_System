import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { FaChevronLeft, FaSignOutAlt } from "react-icons/fa";
import logo from "../assets/Logo.png";
import "./Sidebar.css";

/**
 * Sidebar component
 * Props:
 *  - isCollapsed: boolean
 *  - onToggle: function
 *  - role: "admin" | "supplier" | "buyer" (default: "admin")
 */
const Sidebar = ({ isCollapsed = false, onToggle = () => {}, role = "admin" }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      sessionStorage.removeItem("userRole");
      window.dispatchEvent(new Event("storage")); // ✅ notify App.jsx
      navigate("/");
    }
  };



  const navLinks =
    role === "supplier"
      ? [
          { to: "/supplier/dashboard", label: "Dashboard", emoji: "📊" },
          { to: "/supplier/market", label: "Market", emoji: "🛍️" },
          { to: "/supplier/upload-products", label: "Upload Products", emoji: "📤" },
          { to: "/supplier/reports", label: "Reports", emoji: "📈" },
          { to: "/supplier/profile", label: "Profile", emoji: "👤" },
        ]

      : role === "buyer"
      ? [
          { to: "/buyer/dashboard", label: "Dashboard", emoji: "📊" },
          { to: "/buyer/market", label: "Market", emoji: "🛍️" },
          { to: "/buyer/market-suppliers", label: "Market Suppliers", emoji: "🏢" },
          { to: "/buyer/profile", label: "Profile", emoji: "👤" },
        ]
      : [
          // admin default
          { to: "/admin/dashboard", label: "Dashboard", emoji: "📊" },
          { to: "/admin/manage-accounts", label: "Manage Accounts", emoji: "👥" },
          { to: "/admin/market", label: "Market", emoji: "🛒" },
          { to: "/admin/market-suppliers", label: "Market Suppliers", emoji: "🏢" },
          { to: "/admin/reports", label: "Reports", emoji: "📑" },
          { to: "/admin/settings", label: "Settings", emoji: "⚙️" },
        ];

  return (
    <aside className={`sidebar ${isCollapsed ? "collapsed" : ""}`}>
      <button
        className="sidebar-toggle-btn"
        onClick={onToggle}
        title={isCollapsed ? "Open Sidebar" : "Close Sidebar"}
        aria-label="Toggle sidebar"
      >
        <FaChevronLeft className={`toggle-icon ${isCollapsed ? "rotated" : ""}`} />
      </button>

      <div className="sidebar-header">
        {!isCollapsed && (
          <h2 className="sidebar-title">
            <img src={logo} alt="Logo" className="sidebar-logo-sdo" />
          </h2>
        )}
      </div>

      <nav className="sidebar-nav">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            <span aria-hidden>{link.emoji}</span>
            {!isCollapsed && <span style={{ marginLeft: 8 }}>{link.label}</span>}
          </NavLink>
        ))}
      </nav>

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
