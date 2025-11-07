import React from "react";
import "./Dashboard.css";

const Dashboard = () => {
  // Sample stats (replace with dynamic values later)
  const stats = [
    { label: "Category", value: "Office Supplies" },
    { label: "Total Items", value: 120 },
    { label: "No. Active Suppliers", value: 8 },
    { label: "Average Price", value: "₱3,500" },
    { label: "Lowest Price", value: "₱150" },
    { label: "Highest Price", value: "₱50,000" }
  ];

  const announcements = [
    {
      title: "New Quotation Request: Laptops",
      posted: "Nov 01, 2025",
      end: "Nov 15, 2025",
      status: "Active",
      link: "#"
    },
    {
      title: "New Quotation Request: Printers",
      posted: "Nov 03, 2025",
      end: "Nov 18, 2025",
      status: "Active",
      link: "#"
    },
    {
      title: "System Maintenance Notice",
      posted: "Nov 05, 2025",
      end: "Nov 10, 2025",
      status: "Pending",
      link: "#"
    }
  ];

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h2>📊 Dashboard Overview</h2>
        <p>Welcome to the Admin Dashboard! This is your overview page.</p>
      </div>

      {/* Search */}
      <div className="search-container">
        <input type="text" placeholder="Search..." className="search-bar" />
        <button className="search-btn">Search</button>
      </div>

      {/* Stat Cards */}
      <div className="stats-container">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <h4>{stat.label}</h4>
            <p>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Announcements */}
      <div className="announcements-container">
        {announcements.map((ann, index) => (
          <div key={index} className="announcement-card">
            <div className="announcement-header">
              <h4>{ann.title}</h4>
              <span className={`badge ${ann.status.toLowerCase()}`}>{ann.status}</span>
            </div>
            <p><strong>Posted:</strong> {ann.posted}</p>
            <p><strong>End:</strong> {ann.end}</p>
            <a href={ann.link} className="announcement-link">Click Here</a>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
