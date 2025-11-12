import React, { useState, useMemo } from "react";
import AnnouncementForm from "../../components/AnnouncementForm";
import StatsSection from "../../components/StatsSection";
import "./Dashboard.css";

// Reusable DashboardCard Component
const DashboardCard = ({ title, children, className = "" }) => (
  <div className={`dashboard-card ${className}`}>
    {title && <h4 className="card-title">{title}</h4>}
    {children}
  </div>
);

// Reusable AnnouncementCard Component
const AnnouncementCard = ({ announcement }) => (
  <div className="announcement-card">
    <div className="announcement-header">
      <h4>{announcement.title}</h4>
      <span className="badge">{announcement.category}</span>
    </div>
    <p><strong>Description:</strong> {announcement.description}</p>
    <p><strong>Posted:</strong> {announcement.posted}</p>
    <p><strong>End:</strong> {announcement.end}</p>
    {announcement.file && <p>📎 {announcement.file.name}</p>}
  </div>
);

// Collapsible Section Component
const CollapsibleSection = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible-section">
      <div className="collapsible-header" onClick={() => setOpen(!open)}>
        <h4>{title}</h4>
        <span>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  );
};

// LimitedList Component with See More
const LimitedList = ({ items, renderItem, initialCount = 3 }) => {
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? items : items.slice(0, initialCount);

  return (
    <div>
      {visibleItems.map(renderItem)}
      {items.length > initialCount && (
        <button className="see-more-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? "See Less" : `See More (${items.length - initialCount} more)`}
        </button>
      )}
    </div>
  );
};

const Dashboard = () => {
  const [announcements, setAnnouncements] = useState([
    { title: "New Quotation Request: Laptops", description: "Requesting quotations for 50 laptops.", category: "ICT Equipment", posted: "2025-11-01", end: "2025-11-15", file: null },
    { title: "New Quotation Request: Printers", description: "Requesting quotations for 10 printers.", category: "Office Supplies", posted: "2025-11-03", end: "2025-11-18", file: null },
    { title: "System Maintenance Notice", description: "System maintenance scheduled.", category: "All", posted: "2025-11-05", end: "2025-11-10", file: null },
  ]);

  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");

  const categoryOptions = ["All", "ICT Equipment", "Office Supplies", "Furniture", "Printing Services", "Stationery", "Electronics", "Cleaning Supplies"];

  const filteredAnnouncements = useMemo(() => {
    if (selectedCategory === "All") return announcements;
    return announcements.filter((ann) => ann.category === selectedCategory);
  }, [announcements, selectedCategory]);

  const stats = useMemo(() => {
    const totalItems = filteredAnnouncements.reduce((sum, ann) => {
      const match = ann.description.match(/(\d+)/);
      return sum + (match ? parseInt(match[0], 10) : 0);
    }, 0);

    const categoryCounts = filteredAnnouncements.reduce((acc, ann) => {
      acc[ann.category] = (acc[ann.category] || 0) + 1;
      return acc;
    }, {});

    const mostCommonCategory = selectedCategory === "All"
      ? (Object.keys(categoryCounts).reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b, "None"))
      : selectedCategory;

    const activeSuppliers = Object.keys(categoryCounts).length;

    return [
      { label: "Category", value: mostCommonCategory },
      { label: "Total Items", value: totalItems },
      { label: "No. Active Suppliers", value: activeSuppliers },
      { label: "Average Price", value: "₱3,500" },
      { label: "Lowest Price", value: "₱150" },
      { label: "Highest Price", value: "₱50,000" },
    ];
  }, [filteredAnnouncements, selectedCategory]);

  const suppliersOverview = useMemo(() => {
    const categoryCounts = filteredAnnouncements.reduce((acc, ann) => {
      acc[ann.category] = (acc[ann.category] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(categoryCounts).map(([cat, count]) => ({
      name: `${cat} Supplier`,
      category: cat,
      activeDeals: count,
    }));
  }, [filteredAnnouncements]);

  const handlePostAnnouncement = (newAnn) => {
    setAnnouncements([...announcements, newAnn]);
    setShowModal(false);
    alert("✅ Announcement posted successfully!");
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h2>📊 Dashboard Overview</h2>
        <p>Welcome to the Admin Dashboard! This is your overview page.</p>
        <div className="header-controls">
          <label htmlFor="category-select">Select Category:</label>
          <select
            id="category-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="category-dropdown"
          >
            {categoryOptions.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <button className="clear-btn" onClick={() => setSelectedCategory("All")}>Clear</button>
        </div>
      </div>

      {/* Stats Section */}
      <StatsSection stats={stats} />

      {/* Suppliers Overview with LimitedList */}
      <CollapsibleSection title="🏢 Suppliers Overview">
        <LimitedList
          items={suppliersOverview}
          initialCount={5}
          renderItem={(supplier, i) => (
            <li key={i}>
              <strong>{supplier.name}</strong> ({supplier.category}) - {supplier.activeDeals} active deals
            </li>
          )}
        />
      </CollapsibleSection>

      {/* Announcements Section with LimitedList */}
      <CollapsibleSection title={`📢 Procurement Announcements (${filteredAnnouncements.length})`}>
        <button className="post-btn" onClick={() => setShowModal(true)}>+ Post Announcement</button>
        <LimitedList
          items={filteredAnnouncements}
          initialCount={3}
          renderItem={(ann, i) => <AnnouncementCard key={i} announcement={ann} />}
        />
      </CollapsibleSection>

      {/* Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target.classList.contains("modal-overlay") && setShowModal(false)}
        >
          <div className="modal">
            <button className="modal-close-btn" onClick={() => setShowModal(false)}>✖</button>
            <AnnouncementForm onSubmit={handlePostAnnouncement} onCancel={() => setShowModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
