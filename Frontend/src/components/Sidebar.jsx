import React, { useEffect, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { 
  FaChevronLeft, FaSignOutAlt, FaTachometerAlt, FaShoppingCart, 
  FaUpload, FaChartLine, FaUser, FaUsers, FaCog, FaBuilding 
} from "react-icons/fa";
import logo from "../assets/Logo.png";
import "./Sidebar.css";

const Sidebar = ({ isCollapsed = false, onToggle = () => {}, role }) => {
  const navigate = useNavigate();

  // Derive role from session storage if not provided
  const effectiveRole = useMemo(() => {
    if (role) return role;
    const stored = sessionStorage.getItem("userRole");
    return stored || "admin";
  }, [role]);

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      sessionStorage.clear();
      localStorage.clear();
      window.dispatchEvent(new Event("storage"));
      navigate("/");
    }
  };

  // Persist collapse state across reloads
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebarCollapsed");
      const parsed = stored === "true";
      if (stored !== null && parsed !== isCollapsed) {
        onToggle(parsed);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sidebarCollapsed", String(isCollapsed));
    } catch {}
  }, [isCollapsed]);

  const navLinks =
    effectiveRole === "supplier"
      ? [
          { to: "/supplier/dashboard", label: "Dashboard", icon: <FaTachometerAlt /> },
          { to: "/supplier/market", label: "Market", icon: <FaShoppingCart /> },
          { to: "/supplier/upload-products", label: "Upload Products", icon: <FaUpload /> },
          { to: "/supplier/item-health", label: "Item Health", icon: <FaChartLine /> },
          { to: "/supplier/profile", label: "Profile", icon: <FaUser /> },
        ]
      : effectiveRole === "buyer"
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
        onClick={() => onToggle(!isCollapsed)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(!isCollapsed);
          }
        }}
        title={isCollapsed ? "Open Sidebar" : "Close Sidebar"}
        aria-label="Toggle sidebar"
        aria-expanded={!isCollapsed}
      >
        <FaChevronLeft className={`toggle-icon ${isCollapsed ? "rotated" : ""}`} />
      </button>

      <div className="sidebar-header">
        {!isCollapsed ? (
          <>
            <h2 className="sidebar-title">
              <img
                src={logo}
                alt="MSSS logo"
                className={`sidebar-logo-sdo ${isCollapsed ? "collapsed-logo" : ""}`}
              />
            </h2>
            <div className="sidebar-branding" aria-hidden="true">
              <span className="sidebar-branding-agency">MSSS</span>
              <span className="sidebar-branding-suite">Market Scoping & Survey System</span>
            </div>
          </>
        ) : (
          <span className="sidebar-collapsed-indicator" aria-hidden="true" />
        )}
      </div>

      <nav
        className="sidebar-nav"
        aria-label={`MSSS ${effectiveRole} navigation`}
      >
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
            title={isCollapsed ? link.label : undefined}
          >
            <span className="sidebar-link-icon">{link.icon}</span>
            {!isCollapsed && <span className="sidebar-link-text">{link.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-logout-btn" onClick={handleLogout} title="Logout">
          <FaSignOutAlt className="sidebar-link-icon" />
          {!isCollapsed && "Logout"}
        </button>
        {!isCollapsed && (
          <p className="sidebar-footer-note">Secured MSSS Access</p>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
