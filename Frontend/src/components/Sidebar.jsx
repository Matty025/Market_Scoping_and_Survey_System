import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { 
  FaChevronLeft, FaSignOutAlt, FaTachometerAlt, FaShoppingCart, 
  FaUpload, FaChartLine, FaUser, FaUsers, FaCog, FaBuilding 
} from "react-icons/fa";
import logo from "../assets/Logo.png";
import "./Sidebar.css";

const Sidebar = ({ isCollapsed = false, onToggle = () => {}, role = "admin" }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      sessionStorage.removeItem("userRole");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("fullName");
      sessionStorage.removeItem("userID");
      window.dispatchEvent(new Event("storage"));
      navigate("/");
    }
  };

  const navLinks =
    role === "supplier"
      ? [
          { to: "/supplier/dashboard", label: "Dashboard", icon: <FaTachometerAlt /> },
          { to: "/supplier/market", label: "Market", icon: <FaShoppingCart /> },
          { to: "/supplier/upload-products", label: "Upload Products", icon: <FaUpload /> },
          { to: "/supplier/reports", label: "Reports", icon: <FaChartLine /> },
          { to: "/supplier/profile", label: "Profile", icon: <FaUser /> },
        ]
      : role === "buyer"
      ? [
          { to: "/buyer/dashboard", label: "Dashboard", icon: <FaTachometerAlt /> },
          { to: "/buyer/market", label: "Market", icon: <FaShoppingCart /> },
          { to: "/buyer/market-suppliers", label: "Market Suppliers", icon: <FaBuilding /> },
          { to: "/buyer/profile", label: "Profile", icon: <FaUser /> },
        ]
      : [
          { to: "/admin/dashboard", label: "Dashboard", icon: <FaTachometerAlt /> },
          { to: "/admin/manage-accounts", label: "Manage Accounts", icon: <FaUsers /> },
          { to: "/admin/market", label: "Market", icon: <FaShoppingCart /> },
          { to: "/admin/market-suppliers", label: "Market Suppliers", icon: <FaBuilding /> },
          { to: "/admin/reports", label: "Reports", icon: <FaChartLine /> },
          { to: "/admin/settings", label: "Settings", icon: <FaCog /> },
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
            <img
              src={logo}
              alt="Logo"
              className={`sidebar-logo-sdo ${isCollapsed ? "collapsed-logo" : ""}`}
            />
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
            <span className="sidebar-link-icon">{link.icon}</span>
            {!isCollapsed && <span style={{ marginLeft: 8 }}>{link.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-logout-btn" onClick={handleLogout} title="Logout">
          <FaSignOutAlt className="sidebar-link-icon" />
          {!isCollapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
