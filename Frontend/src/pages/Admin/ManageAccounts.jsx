import React, { useState, useMemo, useEffect } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
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
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("suppliers");
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });
  const [customEmail, setCustomEmail] = useState("");
  const [customSubject, setCustomSubject] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [sendingCustom, setSendingCustom] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveNotes, setApproveNotes] = useState("");
  const [approveDocs, setApproveDocs] = useState({
    hasPhilgeps: false,
    hasSecRegistration: false,
    hasBusinessPermit: false,
    hasTaxClearance: false,
  });
  const [savingApproval, setSavingApproval] = useState(false);
  const [actionModal, setActionModal] = useState(null); // { type: 'reject'|'blacklist'|'reinstate', target, notes }
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, activeTab]);

  const fetchUsers = async () => {
    if (!token) return setToast({ visible: true, message: "Not authenticated", type: "error" });
    setLoadingUsers(true);
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
        driveFolderUrl: u.DriveFolderUrl || "",
        raw: u,
      }));
      setUsers(mapped);
    } catch (err) {
      console.error("Failed to fetch users:", err);
      setToast({ visible: true, message: "Failed to load users", type: "error" });
    } finally {
      setLoadingUsers(false);
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

  const sendCustomAdminEmail = async () => {
    if (!token) return setToast({ visible: true, message: "Not authenticated", type: "error" });
    const target = customEmail.trim();
    const body = customBody.trim();
    const subject = customSubject.trim();

    if (!target) return setToast({ visible: true, message: "Enter a recipient email", type: "warning" });
    if (!body) return setToast({ visible: true, message: "Enter a message body", type: "warning" });

    setSendingCustom(true);
    try {
      await api.post(
        `/api/admin/notifications/custom`,
        { to: target, subject, message: body },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setToast({ visible: true, message: `Email sent to ${target}`, type: "success" });
      setCustomBody("");
      setCustomSubject("");
    } catch (err) {
      console.error("Custom email failed:", err);
      setToast({ visible: true, message: `Send failed: ${err.response?.data?.message || err.message}`, type: "error" });
    } finally {
      setSendingCustom(false);
    }
  };

  const handleApprove = (user) => {
    setApproveTarget(user);
    setApproveNotes("");
    setApproveDocs({
      hasPhilgeps: false,
      hasSecRegistration: false,
      hasBusinessPermit: false,
      hasTaxClearance: false,
    });
  };
  const openActionModal = (type, target) => setActionModal({ type, target, notes: "" });

  const handleReject = (user) => openActionModal("reject", user);
  const handleBlacklist = (user) => openActionModal("blacklist", user);
  const handleReinstate = (user) => openActionModal("reinstate", user);

  const displayedAccounts = useMemo(() => {
    // Show only explicit roles to avoid admin appearing in Buyers tab.
    const data = users.filter((u) => (activeTab === "suppliers" ? u.role === "supplier" : u.role === "buyer"));
    return data
      .filter((acc) => acc.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter((acc) => (statusFilter === "all" ? true : acc.status === statusFilter));
  }, [searchQuery, statusFilter, activeTab, users]);

  const totalAccounts = displayedAccounts.length;
  const totalPages = Math.max(1, Math.ceil(totalAccounts / PAGE_SIZE));
  const startIndex = totalAccounts === 0 ? 0 : (currentPage - 1) * PAGE_SIZE;
  const paginatedAccounts = displayedAccounts.slice(startIndex, startIndex + PAGE_SIZE);
  const endIndex = totalAccounts === 0 ? 0 : Math.min(totalAccounts, startIndex + PAGE_SIZE);
  const pageSummary = totalAccounts === 0
    ? "No accounts to display"
    : `Showing ${startIndex + 1}-${endIndex} of ${totalAccounts}`;
  const showPagination = totalAccounts > 0;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="manage-accounts-container">
      <div className="manage-accounts-header">
        <span className="manage-accounts-tagline">MSSS Admin Console</span>
        <h2>Manage Accounts</h2>
        <p>Review supplier and buyer credentials, approve pending requests, and maintain an up-to-date directory.</p>
      </div>

      <div className="notification-composer">
        <div className="notification-tester__copy">
          <h4>Send email to users</h4>
          <p>Deliver a one-off message to any address. Body supports plain text; line breaks are preserved.</p>
        </div>
        <div className="notification-composer__controls">
          <input
            type="email"
            placeholder="recipient@example.com"
            value={customEmail}
            onChange={(e) => setCustomEmail(e.target.value)}
          />
          <input
            type="text"
            placeholder="Subject (optional)"
            value={customSubject}
            onChange={(e) => setCustomSubject(e.target.value)}
          />
          <textarea
            rows={4}
            placeholder="Message body"
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
          />
          <button
            onClick={sendCustomAdminEmail}
            disabled={!customEmail.trim() || !customBody.trim() || sendingCustom}
            className="tester-send-btn"
          >
            {sendingCustom ? "Sending..." : "Send email"}
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

      {showPagination && (
        <div className="pagination-wrapper top">
          <div className="pagination-summary">{pageSummary}</div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showPreview
            previewCount={7}
          />
        </div>
      )}

      <table className="supplier-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th>Docs Folder</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loadingUsers ? (
            <tr>
              <td colSpan="5" className="no-results">
                <div className="table-loading">
                  <div className="loading-spinner" aria-hidden />
                  <span>Loading accounts...</span>
                </div>
              </td>
            </tr>
          ) : displayedAccounts.length === 0 ? (
            <tr>
              <td colSpan="5" className="no-results">No accounts found.</td>
            </tr>
          ) : (
            paginatedAccounts.map((acc) => (
              <tr key={acc.id}>
                <td data-label="Name">{acc.name}</td>
                <td data-label="Role">{acc.role}</td>
                <td data-label="Status">
                  <span className={`status ${acc.status}`}>{acc.status.toUpperCase()}</span>
                </td>
                <td data-label="Docs Folder" className="docs-cell">
                  {acc.driveFolderUrl ? (
                    <a
                      href={acc.driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="docs-link"
                    >
                      Open folder
                    </a>
                  ) : (
                    <span className="muted">No link</span>
                  )}
                </td>
                <td className="actions-cell" data-label="Actions">
                  {acc.role === 'admin' ? (
                    <span className="admin-label">Admin</span>
                  ) : (
                    <>
                      {acc.status === "pending" && (
                        <>
                          <button onClick={() => handleApprove(acc)} className="approve-btn">
                            Approve
                          </button>
                          <button onClick={() => handleReject(acc)} className="reject-btn">
                            Reject
                          </button>
                        </>
                      )}
                      {acc.status === "active" && (
                        <button onClick={() => handleBlacklist(acc)} className="blacklist-btn">
                          Blacklist
                        </button>
                      )}
                      {acc.status === "blacklisted" && (
                        <button onClick={() => handleReinstate(acc)} className="approve-btn">
                          Reinstate
                        </button>
                      )}
                      {acc.status === "rejected" && (
                        <button onClick={() => handleReinstate(acc)} className="approve-btn">
                          Reinstate
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showPagination && (
        <div className="pagination-wrapper">
          <div className="pagination-summary">{pageSummary}</div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showPreview
            previewCount={7}
          />
        </div>
      )}

      <Toast visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, visible: false })} />

      {approveTarget && (
        <Modal
          show={!!approveTarget}
          onClose={() => !savingApproval && setApproveTarget(null)}
          title={`Approve ${approveTarget.name}`}
        >
          <div className="approve-modal">
            <p className="approve-note">Confirm required documents before approval.</p>
            <label className="approve-notes-label">Optional notes to include in email</label>
            <textarea
              placeholder="Example: Approved after verifying permits."
              value={approveNotes}
              onChange={(e) => setApproveNotes(e.target.value)}
              disabled={savingApproval}
            />
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
                    await updateStatus(approveTarget.id, "active", approveDocs, approveNotes);
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

      {actionModal && (
        <Modal
          show={!!actionModal}
          onClose={() => setActionModal(null)}
          title={`${
            actionModal.type === "reject"
              ? "Reject"
              : actionModal.type === "blacklist"
              ? "Blacklist"
              : actionModal.type === "reinstate"
              ? "Reinstate"
              : "Update"
          } ${actionModal.target?.name || "account"}`}
        >
          <div className="action-modal">
            <p className="approve-note">
              {actionModal.type === "reject" && "Add a rejection reason (shown in the notification email)."}
              {actionModal.type === "blacklist" && "Explain why this account is being blacklisted."}
              {actionModal.type === "reinstate" && "Add optional notes for reinstating this account."}
              {!actionModal.type && "Add optional notes for the email to this user."}
            </p>
            <textarea
              placeholder={
                actionModal.type === "reject"
                  ? "Example: Missing compliance documents."
                  : actionModal.type === "blacklist"
                  ? "Example: Multiple violations / non-compliance."
                  : actionModal.type === "reinstate"
                  ? "Example: Cleared after review."
                  : "Add notes"
              }
              value={actionModal.notes}
              onChange={(e) => setActionModal((prev) => ({ ...prev, notes: e.target.value }))}
            />
            <div className="approve-actions">
              <button className="cancel-btn" onClick={() => setActionModal(null)}>
                Cancel
              </button>
              <button
                className={
                  actionModal.type === "blacklist"
                    ? "blacklist-btn"
                    : actionModal.type === "reject"
                    ? "reject-btn"
                    : "approve-btn"
                }
                onClick={async () => {
                  const targetId = actionModal.target?.id;
                  if (!targetId) return;
                  const notes = actionModal.notes || "";
                  if (actionModal.type === "reject") {
                    await updateStatus(targetId, "rejected", {}, notes);
                  } else if (actionModal.type === "blacklist") {
                    await updateStatus(targetId, "blacklisted", {}, notes);
                  } else {
                    await updateStatus(targetId, "active", {}, notes);
                  }
                  setActionModal(null);
                }}
              >
                {actionModal.type === "reject"
                  ? "Confirm reject"
                  : actionModal.type === "blacklist"
                  ? "Confirm blacklist"
                  : actionModal.type === "reinstate"
                  ? "Confirm reinstate"
                  : "Confirm"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ManageAccounts;
