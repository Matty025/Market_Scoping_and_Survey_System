import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import "./AdminLayout.css";

const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const contentRef = useRef(null);
  const location = useLocation();

  // Initialize from persisted sidebar state
  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebarCollapsed");
      if (stored !== null) {
        setIsSidebarOpen(!(stored === "true"));
      }
    } catch {}
  }, []);

  const toggleSidebar = (nextCollapsed) => {
    if (typeof nextCollapsed === "boolean") {
      setIsSidebarOpen(!nextCollapsed);
    } else {
      setIsSidebarOpen((prev) => !prev);
    }
  };

  // Auto-hide sidebar on mobile/tablet widths (<=768px)
  useEffect(() => {
    const applyMobileSidebarRule = () => {
      if (typeof window !== "undefined" && window.innerWidth <= 768) {
        setIsSidebarOpen(false);
      }
    };
    applyMobileSidebarRule();
    window.addEventListener("resize", applyMobileSidebarRule);
    return () => window.removeEventListener("resize", applyMobileSidebarRule);
  }, []);

  // Reset scroll on route change
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Prevent background scroll only when sidebar overlays on small screens
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const isOverlay = typeof window !== "undefined" && window.innerWidth <= 768;
    const nextOverflow = isOverlay && isSidebarOpen ? "hidden" : "";
    html.style.overflow = nextOverflow;
    body.style.overflow = nextOverflow;
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  const isMobileCompact = typeof window !== "undefined" && window.innerWidth <= 768;

  return (
    <div className={`admin-layout ${!isSidebarOpen ? 'collapsed' : ''} ${isMobileCompact ? 'mobile-compact' : ''} ${isSidebarOpen ? 'sidebar-open' : ''}`}>  
      <Sidebar isCollapsed={!isSidebarOpen} onToggle={toggleSidebar} role="admin" />  

      <div className="admin-main">
        <AdminNavbar
          onToggle={toggleSidebar}
          isCollapsed={!isSidebarOpen}
          className=""
        />  
        <div className="admin-content" ref={contentRef}>
          <Outlet />
        </div>
      </div>

      {/* Optional overlay to close sidebar when clicked */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={toggleSidebar}></div>
      )}
    </div>
  );
};

export default AdminLayout;