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

  // Auto-hide sidebar on very small phones (<=430px width)
  useEffect(() => {
    const applyMobileSidebarRule = () => {
      if (typeof window !== "undefined" && window.innerWidth <= 430) {
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

  const isMobileCompact = typeof window !== "undefined" && window.innerWidth <= 430;

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