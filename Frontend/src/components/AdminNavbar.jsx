import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaBell, FaUserCircle, FaBars } from "react-icons/fa";
import { useAuth } from "./AuthContext";
import api from "../api";
import Toast from "./Toast";
import "./AdminNavbar.css";

const AdminNavbar = ({ title = "Admin", onToggle, isCollapsed, className = "" }) => {
  const { fullName, userRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });
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

  const resolveNotificationPath = (notif = {}) => {
    if (!notif) return null;
    const meta = notif.metadata || {};
    const type = (notif.type || "").toLowerCase();
    // Prefer explicit path if backend sets it
    if (meta.path) return meta.path;
    const fileId = meta.fileId || meta.sourceId || meta.id;
    const uploadId = meta.uploadId || meta.sourceId || meta.id;
    const email = meta.email || meta.sourceId;

    if (roleLower === "admin") {
      if (type.includes("account_pending")) {
        return email ? `/admin/manage-accounts?email=${encodeURIComponent(email)}` : `/admin/manage-accounts`;
      }
      if (type.includes("purchase_request")) {
        return `/admin/dashboard?tab=purchase-requests${uploadId ? `&uploadId=${uploadId}` : ""}`;
      }
      if (type.includes("supplier_response")) {
        return fileId ? `/admin/announcements/${fileId}#responses` : `/admin/dashboard`;
      }
      if (type.includes("announcement")) {
        return fileId ? `/admin/announcements/${fileId}` : `/admin/dashboard`;
      }
      return `/admin/dashboard`;
    }

    if (roleLower === "supplier") {
      if (type.includes("announcement")) {
        return fileId ? `/supplier/dashboard?fileId=${fileId}` : `/supplier/dashboard`;
      }
      return `/supplier/dashboard`;
    }

    if (roleLower === "buyer") {
      if (type.includes("buyer_request_status") || type.includes("purchase_request")) {
        return uploadId ? `/buyer/dashboard?request=${uploadId}` : `/buyer/dashboard`;
      }
      return `/buyer/dashboard`;
    }

    return null;
  };

  const fetchNotifications = async () => {
    setNotifLoading(true);
    setNotifError("");
    try {
      const res = await api.get("/api/notifications", { params: { limit: 10, offset: 0 } });
      setNotifications(res.data?.items || []);
      setSelectedIds([]);
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
    const path = resolveNotificationPath(notif);
    if (!path) return;

    const currentPath = `${location.pathname}${location.search || ""}`;
    if (path === currentPath) {
      setToast({ visible: true, message: "You're already on this page.", type: "info" });
      return;
    }
    navigate(path);
  };

  const handleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSelectAll = () => {
    if (selectedIds.length === notifications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(notifications.map((n) => n.id));
    }
  };

  const handleDelete = async (ids) => {
    const targetIds = Array.isArray(ids) ? ids : [ids];
    if (targetIds.length === 0) return;
    try {
      await api.delete("/api/notifications", { data: { ids: targetIds } });
      setNotifications((prev) => prev.filter((n) => !targetIds.includes(n.id)));
      setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      setUnreadCount((prev) => {
        const removedUnread = notifications.filter((n) => targetIds.includes(n.id) && !n.isRead).length;
        return Math.max(0, prev - removedUnread);
      });
    } catch (err) {
      // ignore for now; optional toast could go here
    }
  };
  
  return (
    <header className={`admin-navbar ${className}`}>
      <Toast
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, visible: false })}
      />
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
                {notifications.length > 0 && (
                  <div className="notif-actions">
                    <label className="notif-select-all">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === notifications.length && notifications.length > 0}
                        onChange={handleSelectAll}
                        aria-label="Select all notifications"
                      />
                      <span>Select all</span>
                    </label>
                    <button
                      className="notif-delete-btn"
                      type="button"
                      onClick={() => handleDelete(selectedIds)}
                      disabled={selectedIds.length === 0}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              {notifLoading && <div className="notif-empty">Loading...</div>}
              {notifError && <div className="notif-empty error">{notifError}</div>}
              {!notifLoading && !notifError && notifications.length === 0 && (
                <div className="notif-empty">No notifications yet</div>
              )}
              {!notifLoading && !notifError && notifications.length > 0 && (
                <div className="notif-list">
                  {notifications.map((n) => (
                    <div key={n.id} className={`notif-item ${n.isRead ? "read" : "unread"}`}>
                      <label className="notif-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(n.id)}
                          onChange={() => handleSelect(n.id)}
                          aria-label={`Select notification ${n.title}`}
                        />
                      </label>
                      <button className="notif-body" onClick={() => handleNotificationClick(n)}>
                        <div className="notif-item__title">{n.title}</div>
                        {n.body && <div className="notif-item__body">{n.body}</div>}
                        <div className="notif-item__meta">{new Date(n.createdAt).toLocaleString()}</div>
                      </button>
                      <button
                        className="notif-delete-one"
                        type="button"
                        title="Delete notification"
                        onClick={() => handleDelete([n.id])}
                      >
                        ×
                      </button>
                    </div>
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