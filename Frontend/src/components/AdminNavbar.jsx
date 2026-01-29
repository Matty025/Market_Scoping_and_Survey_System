import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaBell, FaUserCircle, FaBars } from "react-icons/fa";
import { useAuth } from "./AuthContext";
import api from "../api";
import "./AdminNavbar.css";

const AdminNavbar = ({ title = "Admin", onToggle, isCollapsed, className = "" }) => {
  const { fullName, userRole } = useAuth();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);
  
  // Display full name if available, otherwise fall back to role
  const displayName = fullName || title;
  const roleLower = (userRole || "").toLowerCase();

  const fetchUnread = async () => {
    try {
      const res = await api.get("/api/notifications/unread-count");
      setUnreadCount(Number(res.data?.count || 0));
    } catch (err) {
      // silent fail; no UI impact needed
    }
  };

  const fetchNotifications = async () => {
    setNotifLoading(true);
    setNotifError("");
    try {
      const res = await api.get("/api/notifications", { params: { limit: 10, offset: 0 } });
      setNotifications(res.data?.items || []);
      setUnreadCount((prev) => Math.max(0, res.data?.items?.filter((n) => !n.isRead).length ?? prev));
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load notifications.";
      setNotifError(msg);
    } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    fetchUnread();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggleNotifications = () => {
    const next = !showNotifications;
    setShowNotifications(next);
    if (next) fetchNotifications();
  };

  const handleMarkRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      // ignore
    }
  };

  const handleNotificationClick = (notif) => {
    handleMarkRead(notif.id);
    const path = notif?.metadata?.path;
    if (path) navigate(path);
  };
  
  return (
    <header className={`admin-navbar ${className}`}>
      <div className="navbar-left">
        {onToggle && (
          <button
            className="hamburger-btn"
            onClick={() => onToggle(!isCollapsed)}
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            aria-label="Toggle sidebar"
          >
            {/* Always show hamburger icon (mobile and desktop) */}
            <span className="hamburger-icon-mobile"><FaBars /></span>
            <span className="hamburger-icon-desktop"><FaBars /></span>
          </button>
        )}
        <div className="navbar-title-wrap">
          <h2 className="navbar-title-nav">{displayName}</h2>
          <span className="navbar-branding">MSSS Command Center</span>
        </div>
      </div>
      <div className="navbar-actions">
        <div className="notification-wrap" ref={panelRef}>
          <button className="icon-btn notification-btn" title="Notifications" onClick={handleToggleNotifications}>
            <FaBell />
            {unreadCount > 0 && <span className="notif-dot" aria-label="Unread notifications" />}
          </button>
          {showNotifications && (
            <div className="notif-panel">
              <div className="notif-panel__header">
                <span>Notifications</span>
                {unreadCount > 0 && <span className="notif-count">{unreadCount} new</span>}
              </div>
              {notifLoading && <div className="notif-empty">Loading...</div>}
              {notifError && <div className="notif-empty error">{notifError}</div>}
              {!notifLoading && !notifError && notifications.length === 0 && (
                <div className="notif-empty">No notifications yet</div>
              )}
              {!notifLoading && !notifError && notifications.length > 0 && (
                <div className="notif-list">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      className={`notif-item ${n.isRead ? "read" : "unread"}`}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="notif-item__title">{n.title}</div>
                      {n.body && <div className="notif-item__body">{n.body}</div>}
                      <div className="notif-item__meta">{new Date(n.createdAt).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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