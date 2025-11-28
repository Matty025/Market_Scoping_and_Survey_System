import React from "react";
import { FaBell, FaUserCircle, FaBars, FaChevronLeft } from "react-icons/fa";
import "./AdminNavbar.css";

const AdminNavbar = ({ title = "Admin", onToggle, isCollapsed }) => {
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
        <h2 className="navbar-title-nav">{title}</h2>
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
        <button className="icon-btn" title="Profile">
          <FaUserCircle />
        </button>
      </div>
    </header>
  );
};

export default AdminNavbar;