import React, { useState, useMemo, useEffect } from "react";
import axios from "axios";
import AnnouncementForm from "../../components/AnnouncementForm";
import StatsSection from "../../components/StatsSection";
import ResponseModal from "../../components/ResponseModal"; // Import the new modal
import { useAuth } from "../../components/AuthContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  FaUsers, FaBoxOpen, FaUserClock
} from "react-icons/fa";
import "./Dashboard.css";

// Reusable DashboardCard Component
const DashboardCard = ({ title, children, className = "" }) => (
  <div className={`dashboard-card ${className}`} >
    {title && <h4 className="card-title">{title}</h4>}
    {children}
  </div>
);

// Reusable AnnouncementCard Component
const AnnouncementCard = ({ announcement }) => (
  <div className="announcement-card" >
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
  const { token } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState([]);
  const [suppliersOverview, setSuppliersOverview] = useState([]);
  const [categoryChartData, setCategoryChartData] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [responses, setResponses] = useState([]);
  const [isResponseLoading, setIsResponseLoading] = useState(false);

  const categoryOptions = ["All", "ICT Equipment", "Office Supplies", "Furniture", "Printing Services", "Stationery", "Electronics", "Cleaning Supplies"];

  // Fetch announcements from the backend
  useEffect(() => {
    const fetchAnnouncements = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        // Fetch all dashboard data in parallel
        const [announcementsRes, statsRes] = await Promise.all([
          axios.get("http://localhost:3001/api/admin/announcements", { headers: { Authorization: `Bearer ${token}` } }),
          axios.get("http://localhost:3001/api/dashboard/stats", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        // Format announcements
        const formattedAnnouncements = announcementsRes.data.map(ann => ({
          ...ann,
          posted: new Date(ann.posted).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          end: ann.end ? new Date(ann.end).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"
        }));
        setAnnouncements(formattedAnnouncements);

        // Format stats
        const { totalSuppliers, pendingAccounts, activeAnnouncements } = statsRes.data;
        setStats([
          { label: "Total Suppliers", value: totalSuppliers, icon: <FaUsers />, bgColor: "#e0f2fe" },
          { label: "Active Announcements", value: activeAnnouncements, icon: <FaBoxOpen />, bgColor: "#dcfce7" },
          { label: "Pending Accounts", value: pendingAccounts, icon: <FaUserClock />, bgColor: "#fef9c3" },
        ]);

        setError(null);
      } catch (err) {
        setError("Failed to fetch dashboard data.");
        console.error("Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnnouncements();
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
    data.append("categoryId", formData.categoryId); // Add the selected category ID
    data.append("end", formData.end); // Add the end date

    // Pass the array of supplier IDs to the backend
    if (formData.sendType === 'supplier') {
      const supplierIds = formData.suppliers.filter(id => id !== 'all');
      data.append("suppliers", JSON.stringify(supplierIds));
    } else if (formData.sendType === 'category') {
      // Pass the array of target category IDs
      data.append("categories", JSON.stringify(formData.categories));
    }

    try {
      const response = await axios.post("http://localhost:3001/api/admin/announcements", data, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });
      alert("✅ Announcement posted successfully!");
      setShowModal(false);
      // Refetch announcements to show the new one
      const newAnn = { ...formData, id: response.data.fileId, posted: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) };
      setAnnouncements([newAnn, ...announcements]);
    } catch (err) {
      console.error("Failed to post announcement:", err);
      const errorMsg = err.response?.data?.message || "An error occurred.";
      alert(`❌ Failed to post announcement: ${errorMsg}`);
    }
  };

  const handleOpenResponseModal = async (announcement) => {
    setSelectedAnnouncement(announcement);
    setIsResponseLoading(true);
    try {
      const response = await axios.get(`http://localhost:3001/api/admin/announcements/${announcement.id}/responses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResponses(response.data);
    } catch (error) {
      console.error("Failed to fetch responses:", error);
      alert("Could not load supplier responses.");
    } finally {
      setIsResponseLoading(false);
    }
  };

  const handleCloseResponseModal = () => setSelectedAnnouncement(null);

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h2>📊 Dashboard Overview</h2>
        <p>Welcome to the Admin Dashboard! This is your overview page.</p>
      </div>

      {/* Stats Section */}
      <StatsSection stats={stats} />

      {isLoading && <p>Loading dashboard data...</p>}
      {error && <p className="error-message">{error}</p>}

      <div className="dashboard-grid">
        {/* The main grid area is now empty and ready for future components. */}
      </div>

      {/* Announcements Section with LimitedList */}
      <CollapsibleSection title={`📢 Recent Procurement Announcements (${filteredAnnouncements.length})`}>
        <button className="post-btn" onClick={() => setShowModal(true)}>+ Post Announcement</button>
        <div className="announcements-container">
          <LimitedList
            items={filteredAnnouncements}
            initialCount={3}
            renderItem={(ann, i) => <div key={ann.id || i} onClick={() => handleOpenResponseModal(ann)}><AnnouncementCard announcement={ann} /></div>}
          />
        </div>
      </CollapsibleSection>

      {/* Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target.classList.contains("modal-overlay") && setShowModal(false)}
        >
          <div className="modal">
            <button type="button" className="modal-close-btn" onClick={() => setShowModal(false)}>✖</button>
            <AnnouncementForm onSubmit={handlePostAnnouncement} onCancel={() => setShowModal(false)} />
          </div>
        </div>
      )}

      {/* Responses Modal */}
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