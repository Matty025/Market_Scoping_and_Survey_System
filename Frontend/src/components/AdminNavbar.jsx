import React from "react";
import { useNavigate } from "react-router-dom";
import { FaBell, FaUserCircle, FaBars, FaChevronLeft } from "react-icons/fa";
import { useAuth } from "./AuthContext";
import "./AdminNavbar.css";

const AdminNavbar = ({ title = "Admin", onToggle, isCollapsed }) => {
  const { fullName, userRole } = useAuth();
  const navigate = useNavigate();
  
  // Display full name if available, otherwise fall back to role
  const displayName = fullName || title;
  const roleLower = (userRole || "").toLowerCase();
  
  return (
    <header className="admin-navbar">
      <div className="navbar-left">
        {onToggle && (
          <button
            className="hamburger-btn"
            onClick={() => onToggle(!isCollapsed)}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            aria-label="Toggle sidebar"
          >
            {/* Show bars on mobile, chevron on larger screens */}
            <span className="hamburger-icon-mobile"><FaBars /></span>
            <span className="hamburger-icon-desktop"><FaChevronLeft className={isCollapsed ? "rotated" : ""} /></span>
          </button>
        )}
        <div className="navbar-title-wrap">
          <h2 className="navbar-title-nav">{displayName}</h2>
          <span className="navbar-branding">MSSS Command Center</span>
        </div>
      </div>
      <div className="navbar-actions">
        <input
          type="text"
          placeholder="Search..."
          className="navbar-search-bar"
        />
        <button className="icon-btn" title="Notifications">
          <FaBell />
        </button>
        <button
          className="icon-btn icon-btn-profile"
          title="Profile"
          onClick={() => {
            if (roleLower === "supplier") return navigate("/supplier/profile");
            if (roleLower === "admin") return navigate("/admin/manage-accounts");
            if (roleLower === "buyer") return navigate("/buyer/profile");
            return navigate("/");
          }}
        >
          <FaUserCircle />
        </button>
      </div>
    </header>
  );
};

export default AdminNavbar;