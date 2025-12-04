import React, { useState, useMemo, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import "./ManageAccounts.css";

const backendBase = "http://localhost:3001";

const mapBackendToUI = (backendStatus) => {
  const s = (backendStatus || "").toString().toUpperCase();
  switch (s) {
    case "APPROVED":
      return "active";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "rejected";
    case "BLACKLISTED":
      return "blacklisted";
    default:
      return s.toLowerCase();
  }
};

const mapUIToBackend = (uiStatus) => {
  switch (uiStatus) {
    case "active":
      return "APPROVED";
    case "pending":
      return "PENDING";
    case "rejected":
      return "REJECTED";
    case "blacklisted":
      return "BLACKLISTED";
    default:
      return uiStatus.toUpperCase();
  }
};

const ManageAccounts = () => {
  const { token, userRole } = useAuth();
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("suppliers");
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUsers = async () => {
    if (!token) return setToast({ visible: true, message: "Not authenticated", type: "error" });
    try {
      const res = await axios.get(`${backendBase}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const mapped = res.data.map((u) => ({
        id: u.UserID,
        name: u.FullName || u.Email,
        role: (u.RoleName || "").toLowerCase(),
        backendStatus: u.AccountStatus || "PENDING",
        status: mapBackendToUI(u.AccountStatus),
        lastUpdated: u.DateUpdated || "-",
        raw: u,
      }));
      setUsers(mapped);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setToast({ visible: true, message: "Failed to load users", type: "error" });
    }
  };

  const updateStatus = async (userId, newUIStatus) => {
    if (!token) return setToast({ visible: true, message: "Not authenticated", type: "error" });
    const backendStatus = mapUIToBackend(newUIStatus);
    try {
      await axios.patch(
        `${backendBase}/api/admin/users/${userId}`,
        { status: backendStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: newUIStatus, backendStatus } : u)));
      setToast({ visible: true, message: `User updated to ${newUIStatus}`, type: "success" });
    } catch (err) {
      console.error("Failed to update user status:", err);
      setToast({ visible: true, message: `Update failed: ${err.response?.data?.message || err.message}`, type: "error" });
    }
  };

  const handleApprove = (id) => updateStatus(id, "active");
  const handleReject = (id) => updateStatus(id, "rejected");
  const handleBlacklist = (id) => updateStatus(id, "blacklisted");

  const displayedAccounts = useMemo(() => {
    // Show only explicit roles to avoid admin appearing in Buyers tab.
    const data = users.filter((u) => (activeTab === "suppliers" ? u.role === "supplier" : u.role === "buyer"));
    return data
      .filter((acc) => acc.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((acc) => (statusFilter === "all" ? true : acc.status === statusFilter));
  }, [searchQuery, statusFilter, activeTab, users]);

  return (
    <div className="manage-accounts-container">
      <div className="manage-accounts-header">
        <span className="manage-accounts-tagline">MSSS Admin Console</span>
        <h2>Manage Accounts</h2>
        <p>Review supplier and buyer credentials, approve pending requests, and maintain an up-to-date directory.</p>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${activeTab === "suppliers" ? "active" : ""}`} onClick={() => setActiveTab("suppliers")}>
          Suppliers
        </button>
        <button className={`tab-btn ${activeTab === "buyers" ? "active" : ""}`} onClick={() => setActiveTab("buyers")}>
          Buyers
        </button>
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Search by name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="status-select">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="blacklisted">Blacklisted</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <table className="supplier-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayedAccounts.map((acc) => (
            <tr key={acc.id}>
              <td>{acc.name}</td>
              <td>{acc.role}</td>
              <td>
                <span className={`status ${acc.status}`}>{acc.status.toUpperCase()}</span>
              </td>
              <td>{acc.lastUpdated}</td>
              <td className="actions-cell">
                {acc.role === 'admin' ? (
                  <span className="admin-label">Admin</span>
                ) : (
                  <>
                    {acc.status === "pending" && (
                      <>
                        <button onClick={() => handleApprove(acc.id)} className="approve-btn">
                          Approve
                        </button>
                        <button onClick={() => handleReject(acc.id)} className="reject-btn">
                          Reject
                        </button>
                      </>
                    )}
                    {acc.status === "active" && (
                      <button onClick={() => handleBlacklist(acc.id)} className="blacklist-btn">
                        Blacklist
                      </button>
                    )}
                    {acc.status === "blacklisted" && (
                      <button onClick={() => handleApprove(acc.id)} className="approve-btn">
                        Reinstate
                      </button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Toast visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, visible: false })} />
    </div>
  );
};

export default ManageAccounts;
