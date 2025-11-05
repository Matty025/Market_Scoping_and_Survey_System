import React from "react";
import { FaBell, FaUserCircle } from "react-icons/fa";
import "./AdminNavbar.css";

const AdminNavbar = () => {
  return (
    <header className="admin-navbar">
      <h2 className="navbar-title-nav">Admin</h2>

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