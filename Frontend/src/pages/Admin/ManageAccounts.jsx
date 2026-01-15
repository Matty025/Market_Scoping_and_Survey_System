import React, { useState, useMemo, useEffect } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import Modal from "../../components/Modal";
import "./ManageAccounts.css";

// Use Vite env or centralized api for backend requests
const backendBase = import.meta.env.VITE_API_URL || "http://localhost:3001";

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
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveDocs, setApproveDocs] = useState({
    hasPhilgeps: false,
    hasSecRegistration: false,
    hasBusinessPermit: false,
    hasTaxClearance: false,
  });
  const [savingApproval, setSavingApproval] = useState(false);

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchUsers = async () => {
    if (!token) return setToast({ visible: true, message: "Not authenticated", type: "error" });
    try {
      const res = await api.get(`/api/admin/users`, {
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

  const updateStatus = async (userId, newUIStatus, docsPayload = {}, notes = "") => {
    if (!token) return setToast({ visible: true, message: "Not authenticated", type: "error" });
    const backendStatus = mapUIToBackend(newUIStatus);
    try {
      await api.patch(
        `/api/admin/users/${userId}`,
        { status: backendStatus, documents: docsPayload, notes },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: newUIStatus, backendStatus } : u)));
      setToast({ visible: true, message: `User updated to ${newUIStatus}`, type: "success" });
    } catch (err) {
      console.error("Failed to update user status:", err);
      setToast({ visible: true, message: `Update failed: ${err.response?.data?.message || err.message}`, type: "error" });
    }
  };

  const sendTestPendingEmail = async () => {
    if (!token) return setToast({ visible: true, message: "Not authenticated", type: "error" });
    const trimmed = testEmail.trim();
    if (!trimmed) return setToast({ visible: true, message: "Enter a target email", type: "warning" });

    setSendingTest(true);
    try {
      await api.post(
        `/api/admin/notifications/test-pending`,
        { to: trimmed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setToast({ visible: true, message: `Sent test pending email to ${trimmed}`, type: "success" });
    } catch (err) {
      console.error("Test pending email failed:", err);
      setToast({ visible: true, message: `Test email failed: ${err.response?.data?.message || err.message}`, type: "error" });
    } finally {
      setSendingTest(false);
    }
  };

  const handleApprove = (user) => {
    setApproveTarget(user);
    setApproveDocs({
      hasPhilgeps: false,
      hasSecRegistration: false,
      hasBusinessPermit: false,
      hasTaxClearance: false,
    });
  };
  const handleReject = (id) => updateStatus(id, "rejected");
  const handleBlacklist = (id) => updateStatus(id, "blacklisted");
  const handleReinstate = (id) => updateStatus(id, "active");

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

      <div className="notification-tester">
        <div className="notification-tester__copy">
          <h4>Pending account email tester</h4>
          <p>Send a sample pending-account notification to confirm Gmail connectivity. Uses the same template admins receive when users register.</p>
        </div>
        <div className="notification-tester__controls">
          <input
            type="email"
            placeholder="email@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <button
            onClick={sendTestPendingEmail}
            disabled={!testEmail.trim() || sendingTest}
            className="tester-send-btn"
          >
            {sendingTest ? "Sending..." : "Send test email"}
          </button>
        </div>
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
                        <button onClick={() => handleApprove(acc)} className="approve-btn">
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
                      <button onClick={() => handleReinstate(acc.id)} className="approve-btn">
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

      {approveTarget && (
        <Modal
          show={!!approveTarget}
          onClose={() => !savingApproval && setApproveTarget(null)}
          title={`Approve ${approveTarget.name}`}
        >
          <div className="approve-modal">
            <p className="approve-note">Confirm required documents before approval.</p>
            <div className="checkboxes">
              {[
                { key: "hasPhilgeps", label: "PhilGEPS Registration" },
                { key: "hasSecRegistration", label: "SEC Registration" },
                { key: "hasBusinessPermit", label: "Business Permit" },
                { key: "hasTaxClearance", label: "Tax Clearance" },
              ].map((doc) => (
                <label key={doc.key}>
                  <input
                    type="checkbox"
                    checked={!!approveDocs[doc.key]}
                    onChange={(e) => setApproveDocs((prev) => ({ ...prev, [doc.key]: e.target.checked }))}
                    disabled={savingApproval}
                  />
                  {doc.label}
                </label>
              ))}
            </div>
            <div className="approve-actions">
              <button className="cancel-btn" onClick={() => setApproveTarget(null)} disabled={savingApproval}>Cancel</button>
              <button
                className="approve-btn"
                onClick={async () => {
                  setSavingApproval(true);
                  try {
                    await updateStatus(approveTarget.id, "active", approveDocs, "");
                    setApproveTarget(null);
                  } finally {
                    setSavingApproval(false);
                  }
                }}
                disabled={savingApproval}
              >
                {savingApproval ? "Saving..." : "Confirm approval"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ManageAccounts;
