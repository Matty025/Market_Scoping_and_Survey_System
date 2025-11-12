import React, { useState, useMemo } from "react";
import "./ManageAccounts.css";

const ManageAccounts = () => {
  // Sample supplier and buyer data
  const [suppliers, setSuppliers] = useState([
    { id: 1, name: "ABC Supplies", status: "pending", lastUpdated: "2025-11-10" },
    { id: 2, name: "Tech Solutions", status: "active", lastUpdated: "2025-11-12" },
    { id: 3, name: "Office World", status: "blacklisted", lastUpdated: "2025-10-25" },
    { id: 4, name: "Lab Equip Co.", status: "pending", lastUpdated: "2025-11-11" }
  ]);

  const [buyers, setBuyers] = useState([
    { id: 1, name: "John Doe", status: "active", lastUpdated: "2025-11-09" },
    { id: 2, name: "Jane Smith", status: "blacklisted", lastUpdated: "2025-10-20" }
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("suppliers"); // suppliers or buyers

  const handleApprove = (id) => {
    if (activeTab === "suppliers") {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "active" } : s))
      );
    } else {
      setBuyers((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "active" } : b))
      );
    }
  };

  const handleReject = (id) => {
    if (activeTab === "suppliers") {
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
    } else {
      setBuyers((prev) => prev.filter((b) => b.id !== id));
    }
  };

  const handleBlacklist = (id) => {
    if (activeTab === "suppliers") {
      setSuppliers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: "blacklisted" } : s))
      );
    } else {
      setBuyers((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "blacklisted" } : b))
      );
    }
  };

  // Filtered data based on search & status
  const displayedAccounts = useMemo(() => {
    const data = activeTab === "suppliers" ? suppliers : buyers;
    return data
      .filter((acc) =>
        acc.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .filter((acc) =>
        statusFilter === "all" ? true : acc.status === statusFilter
      );
  }, [searchQuery, statusFilter, activeTab, suppliers, buyers]);

  return (
    <div className="manage-accounts-container">
      <h2>👥 Manage Accounts</h2>
      <p>Here you can view and manage supplier and buyer accounts.</p>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === "suppliers" ? "active" : ""}`}
          onClick={() => setActiveTab("suppliers")}
        >
          Suppliers
        </button>
        <button
          className={`tab-btn ${activeTab === "buyers" ? "active" : ""}`}
          onClick={() => setActiveTab("buyers")}
        >
          Buyers
        </button>
      </div>

      {/* Search & Filter */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="status-select"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="blacklisted">Blacklisted</option>
        </select>
      </div>

      {/* Account Table */}
      <table className="supplier-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayedAccounts.map((acc) => (
            <tr key={acc.id}>
              <td>{acc.name}</td>
              <td>
                <span className={`status ${acc.status}`}>
                  {acc.status.toUpperCase()}
                </span>
              </td>
              <td>{acc.lastUpdated}</td>
              <td className="actions-cell">
                {acc.status === "pending" && (
                  <>
                    <button
                      onClick={() => handleApprove(acc.id)}
                      className="approve-btn"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(acc.id)}
                      className="reject-btn"
                    >
                      Reject
                    </button>
                  </>
                )}
                {acc.status === "active" && (
                  <button
                    onClick={() => handleBlacklist(acc.id)}
                    className="blacklist-btn"
                  >
                    Blacklist
                  </button>
                )}
                {acc.status === "blacklisted" && (
                  <button
                    onClick={() => handleApprove(acc.id)}
                    className="approve-btn"
                  >
                    Reinstate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ManageAccounts;
