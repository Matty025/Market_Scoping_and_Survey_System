
import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import "./BuyerLayout.css"; // Reuse admin layout styles (ensure this file exists or copy from AdminLayout.css)

const BuyerLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const lastScrollYRef = useRef(0);
  const contentRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sidebarCollapsed");
      if (stored !== null) {
        setIsSidebarOpen(!(stored === "true"));
      }
    } catch {}
  }, []);

  // Auto-hide sidebar on very small phones (<=430px width)
  useEffect(() => {
    const applyMobileSidebarRule = () => {
      if (window.innerWidth <= 430) {
        setIsSidebarOpen(false);
      }
    };
    applyMobileSidebarRule();
    window.addEventListener("resize", applyMobileSidebarRule);
    return () => window.removeEventListener("resize", applyMobileSidebarRule);
  }, []);

  // Reset scroll on route change
  useEffect(() => {
    lastScrollYRef.current = 0;
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  const toggleSidebar = (nextCollapsed) => {
    if (typeof nextCollapsed === "boolean") {
      setIsSidebarOpen(!nextCollapsed);
    } else {
      setIsSidebarOpen((prev) => !prev);
    }
  };

  const isMobileCompact = typeof window !== "undefined" && window.innerWidth <= 430;

  return (
    <div className={`admin-layout ${!isSidebarOpen ? "collapsed" : ""} ${isMobileCompact ? "mobile-compact" : ""} ${isSidebarOpen ? "sidebar-open" : ""}`}>
      {/* Sidebar (pass role="buyer" to customize for buyers) */}
      <Sidebar isCollapsed={!isSidebarOpen} onToggle={toggleSidebar} role="buyer" />

      <div className="admin-main">
        {/* Reuse AdminNavbar but pass a buyer-specific title and toggle */}
        <AdminNavbar
          title="Buyer"
          onToggle={toggleSidebar}
          isCollapsed={!isSidebarOpen}
          className=""
        />

        <div className="admin-content" ref={contentRef}>
          <Outlet />
        </div>
      </div>

      {isSidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}
    </div>
  );
};

export default BuyerLayout;  // <-- Now matches the component name
