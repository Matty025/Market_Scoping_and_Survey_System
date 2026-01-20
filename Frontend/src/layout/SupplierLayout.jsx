// src/layout/SupplierLayout.jsx
import React, { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import AdminNavbar from "../components/AdminNavbar";
import Footer from "../components/Footer";
import "./SupplierLayout.css"; // reuse admin layout styles

const SupplierLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [showFooter, setShowFooter] = useState(false);
  const lastScrollYRef = useRef(0);
  const contentRef = useRef(null);

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

  // Header hide/show on scroll and footer visibility when at bottom for small devices
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const handleScroll = () => {
      const y = el.scrollTop;
      const lastY = lastScrollYRef.current;
      const isMobile = typeof window !== "undefined" && window.innerWidth <= 430;

      if (isMobile) {
        if (y > lastY + 4) {
          setIsHeaderHidden(true);
        } else if (y < lastY - 4 || y <= 4) {
          setIsHeaderHidden(false);
        }
      } else {
        setIsHeaderHidden(false);
      }

      lastScrollYRef.current = y;

      const reachedBottom = Math.ceil(y + el.clientHeight) >= el.scrollHeight;
      setShowFooter(reachedBottom && isMobile);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const isMobileCompact = typeof window !== "undefined" && window.innerWidth <= 430;
  const shouldShowFooter = isMobileCompact ? showFooter : true;

  return (
    <div className={`admin-layout ${!isSidebarOpen ? "collapsed" : ""} ${isMobileCompact ? "mobile-compact" : ""} ${isSidebarOpen ? "sidebar-open" : ""}`}>
      {/* Sidebar (pass role="supplier" to reuse Sidebar component) */}
      <Sidebar isCollapsed={!isSidebarOpen} onToggle={toggleSidebar} role="supplier" />

      <div className="admin-main">
        {/* Reuse AdminNavbar but pass a title and toggle */}
        <AdminNavbar title="Supplier" onToggle={toggleSidebar} isCollapsed={!isSidebarOpen} className={isHeaderHidden ? "navbar-hidden" : ""} />

        <div className="admin-content" ref={contentRef}>
          <Outlet />
        </div>

        {shouldShowFooter && <Footer />}
      </div>

      {/* Optional overlay to close sidebar when clicked */}
      {isSidebarOpen && <div className="sidebar-overlay" onClick={toggleSidebar}></div>}
    </div>
  );
};

export default SupplierLayout;
