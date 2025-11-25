import React, { useState, useMemo, useEffect } from "react";
import axios from "axios";
import AnnouncementForm from "../../components/AnnouncementForm";
import StatsSection from "../../components/StatsSection";
import ResponseModal from "../../components/ResponseModal";
import { useAuth } from "../../components/AuthContext";
import { 
  FaUsers, FaBoxOpen, FaCheckCircle, FaClock, FaClipboardList, FaTag, FaUserCheck
} from "react-icons/fa";
import "./Dashboard.css";

// Reusable DashboardCard Component
const DashboardCard = ({ title, children, className = "" }) => (
  <div className={`dashboard-card ${className}`}>
    {title && <h4 className="card-title">{title}</h4>}
    {children}
  </div>
);

// AnnouncementCard Component
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

// LimitedList Component
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
  const { token } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [responses, setResponses] = useState([]);
  const [isResponseLoading, setIsResponseLoading] = useState(false);

  const categoryOptions = [
    "All", "ICT Equipment", "Office Supplies", "Furniture",
    "Printing Services", "Stationery", "Electronics", "Cleaning Supplies"
  ];

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!token) return;
      setIsLoading(true);

      try {
        const [announcementsRes, statsRes] = await Promise.all([
          axios.get("http://localhost:3001/api/admin/announcements", { headers: { Authorization: `Bearer ${token}` } }),
          axios.get("http://localhost:3001/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
        ]);

        console.group("📢 Dashboard API Responses");
        console.log("Announcements API:", announcementsRes.data);
        console.log("Stats API:", statsRes.data);
        console.groupEnd();

        // Format announcements
        const formattedAnnouncements = announcementsRes.data.map(ann => ({
          ...ann,
          posted: ann.posted ? new Date(ann.posted).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A",
          end: ann.end ? new Date(ann.end).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"
        }));

        console.group("📝 Formatted Announcements");
        console.log(formattedAnnouncements);
        console.groupEnd();
        setAnnouncements(formattedAnnouncements);

        // Stats parsing and debug
        const s = statsRes.data || {};
        console.group("📊 Stats Debug");
        console.log("Raw stats object:", s);
        console.log("totalSuppliers:", s.totalSuppliers);
        console.log("totalProducts:", s.totalProducts);
        console.log("activeAnnouncements:", s.activeAnnouncements);
        console.log("pendingResponses:", s.pendingResponses);
        console.log("answeredResponses:", s.answeredResponses);
        console.log("totalCategories:", s.totalCategories);
        console.log("pendingAccounts:", s.pendingAccounts);
        console.groupEnd();

        setStats([
          { label: "Total Suppliers", value: s.totalSuppliers || 0, icon: <FaUsers />, bgColor: "#2563eb" },
          { label: "Total Products", value: s.totalProducts || 0, icon: <FaBoxOpen />, bgColor: "#3b82f6" },
          { label: "Active Announcements", value: s.activeAnnouncements || 0, icon: <FaClock />, bgColor: "#60a5fa" },
          { label: "Pending Responses", value: s.pendingResponses || 0, icon: <FaClipboardList />, bgColor: "#1d4ed8" },
          { label: "Answered Responses", value: s.answeredResponses || 0, icon: <FaCheckCircle />, bgColor: "#93c5fd" },
          { label: "Total Categories", value: s.totalCategories || 0, icon: <FaTag />, bgColor: "#3b82f6" },
          { label: "Pending Accounts", value: s.pendingAccounts || 0, icon: <FaUserCheck />, bgColor: "#2563eb" }
        ]);

        setError(null);
      } catch (err) {
        setError("Failed to fetch dashboard data.");
        console.error("❌ Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [token]);

  const filteredAnnouncements = useMemo(() => {
    if (selectedCategory === "All") return announcements;
    return announcements.filter((ann) => ann.category === selectedCategory);
  }, [announcements, selectedCategory]);

  const handlePostAnnouncement = async (formData) => {
    const data = new FormData();
    data.append("title", formData.title);
    data.append("description", formData.description);
    data.append("file", formData.file);
    data.append("categoryId", formData.categoryId);
    data.append("end", formData.end);

    if (formData.sendType === 'supplier') {
      const supplierIds = formData.suppliers.filter(id => id !== 'all');
      data.append("suppliers", JSON.stringify(supplierIds));
    } else if (formData.sendType === 'category') {
      data.append("categories", JSON.stringify(formData.categories));
    }

    try {
      const response = await axios.post(
        "http://localhost:3001/api/admin/announcements",
        data,
        { headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` } }
      );
      console.log("✅ Posted announcement response:", response.data);
      setShowModal(false);

      const newAnn = {
        ...formData,
        id: response.data.fileId,
        posted: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
        category: categoryOptions.find(c => c === formData.categoryId) || formData.categoryId
      };
      setAnnouncements([newAnn, ...announcements]);
    } catch (err) {
      console.error("❌ Failed to post announcement:", err);
      const errorMsg = err.response?.data?.message || "An error occurred.";
      alert(`Failed to post announcement: ${errorMsg}`);
    }
  };

  const handleOpenResponseModal = async (announcement) => {
    setSelectedAnnouncement(announcement);
    setIsResponseLoading(true);
    try {
      const response = await axios.get(
        `http://localhost:3001/api/admin/announcements/${announcement.id}/responses`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`Responses for announcement ${announcement.id}:`, response.data);
      setResponses(response.data);
    } catch (error) {
      console.error("❌ Failed to fetch responses:", error);
      alert("Could not load supplier responses.");
    } finally {
      setIsResponseLoading(false);
    }
  };

  const handleCloseResponseModal = () => setSelectedAnnouncement(null);

  return (
    <div className="dashboard-container">
<div className="dashboard-header">
  <h2>📊 Dashboard Overview</h2>
  <p>Welcome! Here's a summary of your procurement activities.</p>
</div>

      <StatsSection stats={stats} />

      {isLoading && <p>Loading dashboard data...</p>}
      {error && <p className="error-message">{error}</p>}

      <CollapsibleSection title={`📢 Recent Procurement Announcements (${filteredAnnouncements.length})`}>
        <button className="post-btn" onClick={() => setShowModal(true)}>+ Post Announcement</button>
        <div className="announcements-container">
          {filteredAnnouncements.length === 0 && <p>No announcements found.</p>}
          <LimitedList
            items={filteredAnnouncements}
            initialCount={3}
            renderItem={(ann) => (
              <div key={ann.id} onClick={() => handleOpenResponseModal(ann)}>
                <AnnouncementCard announcement={ann} />
              </div>
            )}
          />
        </div>
      </CollapsibleSection>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => (e.target.classList.contains("modal-overlay") || e.target.classList.contains("modal-close-btn")) && setShowModal(false)}>
          <div className="modal">
            <button type="button" className="modal-close-btn" onClick={() => setShowModal(false)}>✖</button>
            <AnnouncementForm onSubmit={handlePostAnnouncement} onCancel={() => setShowModal(false)} />
          </div>
        </div>
      )}

      {selectedAnnouncement && (
        <ResponseModal
          announcement={selectedAnnouncement}
          responses={responses}
          isLoading={isResponseLoading}
          onClose={handleCloseResponseModal}
        />
      )}
    </div>
  );
};

export default Dashboard;
