import React from "react";
import { FaBell, FaUserCircle } from "react-icons/fa"; // Removed FaBars
import "./AdminNavbar.css";

const AdminNavbar = ({ title = "Admin" }) => {
  return (
    <header className="admin-navbar">
      <div className="navbar-left">
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