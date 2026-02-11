import React, { useState, useEffect } from "react";
import { 
  FaPlus, 
  FaTrash, 
  FaEye, 
  FaCalendarAlt, 
  FaCheckCircle, 
  FaClock, 
  FaTimesCircle, 
  FaFilePdf, 
  FaExclamationTriangle,
  FaChevronDown,
  FaChevronUp
} from "react-icons/fa";
import "./Dashboard.css";
import api from "../../api";
import Pagination from "../../components/Pagination";

const Dashboard = () => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    notes: "",
    endDate: "",
    file: null,
  });
  const [uploadStatus, setUploadStatus] = useState("");
  const [validationErrors, setValidationErrors] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [userNames, setUserNames] = useState({}); // cache of userId -> FullName
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Helper: Status Colors
  const getStatusConfig = (status) => {
    const s = String(status || "").toUpperCase();
    switch (s) {
      // Pending: yellow
      case "PENDING": return { color: "#f59e0b", icon: <FaClock />, label: "Pending" };
      // In progress: purple
      case "IN_PROGRESS": return { color: "#7c3aed", icon: <FaClock />, label: "In Progress" };
      // Reviewed: blue
      case "REVIEWED": return { color: "#2563eb", icon: <FaCheckCircle />, label: "Reviewed" };
      // Completed: darker green
      case "COMPLETED": return { color: "#15803d", icon: <FaCheckCircle />, label: "Completed" };
      // Quoted / other informative states: purple
      case "QUOTED": return { color: "#7c3aed", icon: <FaCheckCircle />, label: "Quoted" };
      // Rejected: red
      case "REJECTED": return { color: "#ef4444", icon: <FaTimesCircle />, label: "Rejected" };
      // Fallback: neutral gray
      default: return { color: "#6b7280", icon: <FaClock />, label: status || "Unknown" };
    }
  };

  // Validation function
  const validateForm = () => {
    const errors = [];
    
    // Title validation
    if (!form.title || !form.title.trim()) {
      errors.push('Title is required');
    } else if (form.title.trim().length < 5) {
      errors.push('Title must be at least 5 characters long');
    } else if (form.title.trim().length > 200) {
      errors.push('Title must not exceed 200 characters');
    }
    
    // Description validation
    if (!form.description || !form.description.trim()) {
      errors.push('Description is required');
    } else if (form.description.trim().length < 20) {
      errors.push('Description must be at least 20 characters long');
    } else if (form.description.trim().length > 2000) {
      errors.push('Description must not exceed 2000 characters');
    }
    
    // End date validation
    if (!form.endDate) {
      errors.push('End date is required');
    } else {
      const selectedDate = new Date(form.endDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (isNaN(selectedDate.getTime())) {
        errors.push('Invalid end date');
      } else if (selectedDate < today) {
        errors.push('End date cannot be in the past');
      } else {
        // Check if date is too far in the future (e.g., more than 1 year)
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
        if (selectedDate > oneYearFromNow) {
          errors.push('End date cannot be more than 1 year in the future');
        }
      }
    }
    
    // File validation
    if (!form.file) {
      errors.push('PDF file attachment is required');
    } else {
      // Check file type
      if (form.file.type !== 'application/pdf') {
        errors.push('Only PDF files are allowed');
      }
      
      // Check file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB in bytes
      if (form.file.size > maxSize) {
        errors.push('File size must be less than 10MB');
      }
      
      // Check if file size is suspiciously small (might be corrupted)
      if (form.file.size < 1024) { // Less than 1KB
        errors.push('File appears to be too small or corrupted');
      }
    }
    
    // Notes validation (optional but with limits)
    if (form.notes && form.notes.trim().length > 1000) {
      errors.push('Notes must not exceed 1000 characters');
    }
    
    return errors;
  };

  const handleOpenModal = () => {
    setShowModal(true);
    setUploadStatus("");
    setValidationErrors([]);
    setForm({ title: "", description: "", notes: "", endDate: "", file: null });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setValidationErrors([]);
    setUploadStatus("");
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    
    // Clear validation errors when user starts typing
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
    
    setForm((prev) => ({
      ...prev,
      [name]: type === "file" ? files[0] : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Reset states
    setUploadStatus("");
    setValidationErrors([]);
    
    // Validate form
    const errors = validateForm();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setUploadStatus("You are not logged in. Please log in first.");
      return;
    }

    setIsSubmitting(true);
    setUploadStatus("Uploading...");

    try {
      const data = new FormData();
      data.append("title", form.title.trim());
      data.append("description", form.description.trim());
      data.append("notes", form.notes.trim());
      data.append("endDate", form.endDate);
      data.append("file", form.file);

      try {
        const response = await api.post("/api/buyer/upload", data, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
        });
        if (!(response && (response.status === 200 || response.status === 201))) {
          setUploadStatus((response?.data && (response.data.error || response.data.message)) || "Upload failed.");
          setIsSubmitting(false);
          return;
        }
      } catch (uploadErr) {
        const errMsg = uploadErr.response?.data?.error || uploadErr.response?.data?.message || "Upload failed.";
        setUploadStatus(errMsg);
        setIsSubmitting(false);
        return;
      }

      setUploadStatus("Purchase request sent successfully!");
      setTimeout(() => {
        setShowModal(false);
        setRefreshKey(old => old + 1);
      }, 1500);

    } catch (err) {
      console.error("Upload error:", err);
      setUploadStatus("Server error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const fetchRequests = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setRequestsLoading(false);
        return;
      }
      setRequestsLoading(true);
      
      try {
        const res = await api.get("/api/buyer/requests", { headers: { Authorization: `Bearer ${token}` } });
        setRequests(res.data.requests || []);
      } catch (err) {
        console.error("Fetch error", err);
        setRequests([]);
      }
      setRequestsLoading(false);
    };
    
    fetchRequests();
  }, [refreshKey]);

  useEffect(() => {
    // Reset to first page when data set changes
    setCurrentPage(1);
  }, [requests]);

  const handleViewDetails = (request) => {
    setSelectedRequest(request);
    setDetailsModalOpen(true);
    // preload history for the selected request so it's ready if user expands
    if (request && request.id) {
      fetchHistory(request.id);
      setHistoryOpen(false);
    }
  };

  

  const handleCloseDetailsModal = () => {
    setDetailsModalOpen(false);
    setSelectedRequest(null);
    // clear history when closing details
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(false);
    setHistoryOpen(false);
  };

  const handleDeleteRequest = async (e, id) => {
    e.stopPropagation();
    
    const token = localStorage.getItem("token");
    if (!token) return;
    
    if (!window.confirm("Are you sure you want to delete this purchase request? This action cannot be undone.")) {
      return;
    }

    setDeleteStatus("Deleting...");

    try {
      try {
        const response = await api.delete(`/api/buyer/requests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (response.status >= 200 && response.status < 300) {
          setDeleteStatus("Request deleted successfully.");
          setRefreshKey(old => old + 1);
          setTimeout(() => setDeleteStatus(""), 3000);
        } else {
          setDeleteStatus(response.data?.error || "Failed to delete request.");
          setTimeout(() => setDeleteStatus(""), 5000);
        }
      } catch (delErr) {
        console.error("Delete error:", delErr);
        setDeleteStatus(delErr.response?.data?.error || "Server error while deleting.");
        setTimeout(() => setDeleteStatus(""), 5000);
      }
    } catch (err) {
      console.error("Delete error:", err);
      setDeleteStatus("Server error while deleting.");
      setTimeout(() => setDeleteStatus(""), 5000);
    }
  };

  // Get minimum date for date input (today)
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Fetch history entries for a purchase request (backend route to be added later)
  const fetchHistory = async (uploadId) => {
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(true);

    const token = localStorage.getItem("token");
    if (!token) {
      setHistoryError("Not authenticated");
      setHistoryLoading(false);
      return;
    }

    try {
      try {
        const res = await api.get(`/api/buyer/requests/${uploadId}/history`, { headers: { Authorization: `Bearer ${token}` } });
        const hist = res.data.history || [];
        setHistory(hist);
        // prefetch any numeric actor ids found in history details
        hist.forEach(h => {
          const raw = h.Details || h.details || '';
          const { actor } = parseDetails(raw);
          if (actor && /^\d+$/.test(String(actor).trim())) {
            const id = String(actor).trim();
            if (!userNames[id]) fetchUserName(id);
          }
        });
      } catch (histErr) {
        let msg = 'History not available yet';
        if (histErr.response && histErr.response.data) msg = histErr.response.data.error || histErr.response.data.message || msg;
        setHistoryError(msg);
      }
    } catch (err) {
      console.error('History fetch error', err);
      setHistoryError('Server error while fetching history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchUserName = async (id) => {
    if (!id) return;
    // already cached
    if (userNames[id]) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await api.get(`/api/buyer/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const name = res.data && res.data.user && (res.data.user.FullName || res.data.user.fullName || res.data.user.Fullname) || null;
      if (name) setUserNames(prev => ({ ...prev, [id]: name }));
    } catch (err) {
      // ignore failures; leave numeric id as fallback
      console.warn('Failed to fetch user name for', id, err && err.message);
    }
  };

  // UI helpers for history display
  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString();
  };

  const parseDetails = (details) => {
    if (!details) return { actor: null, body: null };
    const lines = String(details).split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return { actor: null, body: null };
    // If the first line begins with "By:", treat it as the actor line
    let actor = null;
    let bodyLines = lines.slice();
    if (/^By:/i.test(lines[0])) {
      actor = lines[0].replace(/^By:\s*/i, '').trim();
      bodyLines = lines.slice(1);
    }
    return { actor, body: bodyLines.join('\n') || null };
  };

  // relative time helper (simple)
  const timeAgo = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  };

  const resolveAttachmentUrl = (req) => {
    if (!req) return null;
    const signed = req.fileUrl || req.file_url;
    if (typeof signed === 'string' && signed.trim().length > 0) {
      return signed.trim();
    }

    const raw = req.filePath || req.filepath || '';
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;

    if (req.id) {
      // Use protected buyer download endpoint (relative so it works on same origin and with axios baseURL)
      return `/api/buyer/requests/${req.id}/file`;
    }

    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
  };

  const openProtectedUrl = async (url) => {
    if (!url) return;
    try {
      if (/\.blob\.core\.windows\.net\//i.test(url) && !url.includes('?')) {
        const resp = await api.get('/api/files/sas', { params: { blobUrl: url } });
        const sas = resp.data?.url || url;
        window.open(sas, '_blank');
        return;
      }

      const backendBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const isApiUrl = url.startsWith(backendBase) || url.startsWith('/api/') || url.includes('/api/');
      if (isApiUrl) {
        try {
          const pathForApi = url.startsWith(backendBase)
            ? url.replace(backendBase, '')
            : (url.startsWith('http') ? url : url);
          const resp = await api.get(pathForApi, { responseType: 'blob' });
          const blob = new Blob([resp.data], { type: resp.headers['content-type'] || 'application/pdf' });
          const blobUrl = window.URL.createObjectURL(blob);
          window.open(blobUrl, '_blank');
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60 * 1000);
          return;
        } catch (fetchErr) {
          console.error('Authenticated fetch failed; not opening unauthenticated URL', fetchErr);
          alert('Unable to fetch the protected file. Please ensure you are logged in and try again.');
          return;
        }
      }

      window.open(url, '_blank');
    } catch (err) {
      console.error('Failed to open protected URL', err);
      window.open(url, '_blank');
    }
  };

  const totalPages = Math.max(1, Math.ceil(requests.length / itemsPerPage));
  const paginatedRequests = requests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const showingStart = requests.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingEnd = Math.min(currentPage * itemsPerPage, requests.length);

  return (
    <div className="dashboard-container">
      {/* Header Section */}
      <div className="dashboard-header">
        <span className="dashboard-header-tagline">Buyer Console</span>
        <h2>Dashboard Overview</h2>
        <p>Submit procurement requests and send survey items to admin for approval.</p>
        <p className="dashboard-header-contact">
          For inquiries, email <a href="mailto:sdomarketscoping@gmail.com">sdomarketscoping@gmail.com</a> or call <a href="tel:09258814880">09258814880</a>.
        </p>
      </div>

      {/* Main Content Area */}
      <div className="collapsible-section">
        <div className="collapsible-header">
          <h4>📑 My Purchase Requests ({requests.length})</h4>
        </div>
        
        <div className="collapsible-content">
          <div className="dashboard-filters">
            <div className="filters-left">
              <button className="post-btn" onClick={handleOpenModal}>
                <FaPlus style={{ marginRight: "6px" }} /> Create Purchase Request
              </button>
            </div>
            <div className="filters-right">
              {deleteStatus && (
                <span className={`status-message ${deleteStatus.includes('success') ? 'success' : 'error'}`}>
                  {deleteStatus}
                </span>
              )}
            </div>
          </div>

          {requestsLoading ? (
            <div className="requests-loading">
              <span className="requests-loading-spinner" aria-hidden="true" />
              <p>Loading your requests...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="no-requests">
              <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                <p>No requests submitted yet.</p>
                <p style={{ fontSize: "14px", marginTop: "8px" }}>
                  Click "Create Purchase Request" to get started.
                </p>
              </div>
            </div>
          ) : (
            <div className="announcements-container">
                {requests.length > 0 && (
                  <div className="pagination-wrapper top">
                    <div className="pagination-summary">
                      Showing {showingStart}-{showingEnd} of {requests.length}
                    </div>
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                      previewCount={7}
                    />
                  </div>
                )}

                {paginatedRequests.map((req) => {
                const statusConfig = getStatusConfig(req.status);
                const fullFileUrl = resolveAttachmentUrl(req);
                return (
                  <div 
                    key={req.id} 
                    className="announcement-card" 
                    onClick={() => handleViewDetails(req)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="announcement-header">
                      <h4>{req.title}</h4>
                      <div className="announcement-header-right">
                        <span 
                          className="badge" 
                          style={{ backgroundColor: statusConfig.color }}
                        >
                          {statusConfig.icon} 
                          <span style={{marginLeft: '4px'}}>{statusConfig.label}</span>
                        </span>
                      </div>
                    </div>

                    <div className="announcement-metadata">
                      <span className="badge badge-date">
                        <FaCalendarAlt /> Due: {
                          req.endDate && !isNaN(new Date(req.endDate)) 
                            ? new Date(req.endDate).toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric' 
                              })
                            : '-'
                        }
                      </span>
                      {fullFileUrl && (
                        <a
                          href="#"
                          className="badge badge-file"
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); openProtectedUrl(fullFileUrl); }}
                        >
                          <FaFilePdf /> View File
                        </a>
                      )}
                    </div>

                    <div className="announcement-preview">
                      <p className="announcement-preview-summary">
                        {req.description.length > 150 
                          ? `${req.description.substring(0, 150)}...` 
                          : req.description
                        }
                      </p>
                    </div>

                    <div className="announcement-status-bar">
                      <div className="status-pill-group">
                        <span className="status-pill-text">
                          Submitted: {new Date(req.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                      
                      <div className="status-action-group">
                        <button 
                          className="status-action-btn status-action-btn--primary"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            handleViewDetails(req); 
                          }}
                        >
                          <FaEye /> View
                        </button>
                        
                        {req.status === "PENDING" && (
                          <button 
                            className="status-action-btn status-action-btn--danger"
                            onClick={(e) => handleDeleteRequest(e, req.id)}
                          >
                            <FaTrash /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {requests.length > 0 && (
                <div className="pagination-wrapper">
                  <div className="pagination-summary">
                    Showing {showingStart}-{showingEnd} of {requests.length}
                  </div>
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    previewCount={7}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Request Modal */}
      {showModal && (
        <div 
          className="modal-overlay" 
          onClick={(e) => e.target.classList.contains("modal-overlay") && handleCloseModal()}
        >
          <div className="modal" style={{ maxWidth: '600px' }}>
            <button 
              type="button" 
              className="modal-close-btn" 
              onClick={handleCloseModal}
            >
              ✖
            </button>
            <h3 className="modal-title">Create Purchase Request</h3>
            
            <form onSubmit={handleSubmit} className="purchase-request-form">
              {/* Validation Errors Display */}
              {validationErrors.length > 0 && (
                <div className="validation-errors">
                  <div className="validation-errors-header">
                    <FaExclamationTriangle />
                    <span>Please fix the following errors:</span>
                  </div>
                  <ul>
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="title">
                  Title <span className="required">*</span>
                </label>
                <input
                  type="text" 
                  id="title" 
                  name="title"
                  className="form-input"
                  value={form.title} 
                  onChange={handleChange}
                  placeholder="e.g. IT Equipment Procurement"
                  maxLength="200"
                  disabled={isSubmitting}
                />
                <small className="form-hint">
                  {form.title.length}/200 characters
                </small>
              </div>
              
              <div className="form-group">
                <label htmlFor="description">
                  Description <span className="required">*</span>
                </label>
                <textarea
                  id="description" 
                  name="description"
                  className="form-textarea"
                  value={form.description} 
                  onChange={handleChange}
                  placeholder="Provide a detailed description of your procurement request..."
                  rows="5"
                  maxLength="2000"
                  disabled={isSubmitting}
                />
                <small className="form-hint">
                  {form.description.length}/2000 characters (minimum 20)
                </small>
              </div>
              
              <div className="form-group-row">
                <div className="form-group half">
                  <label htmlFor="endDate">
                    End Date <span className="required">*</span>
                  </label>
                  <input
                    type="date" 
                    id="endDate" 
                    name="endDate"
                    className="form-input"
                    value={form.endDate} 
                    onChange={handleChange}
                    min={getMinDate()}
                    disabled={isSubmitting}
                  />
                  <small className="form-hint">
                    Deadline for this request
                  </small>
                </div>
                
                <div className="form-group half">
                  <label htmlFor="file">
                    Attachment (PDF) <span className="required">*</span>
                  </label>
                  <div className="file-input-wrapper">
                    <input
                      type="file" 
                      id="file" 
                      name="file"
                      accept=".pdf"
                      onChange={handleChange}
                      className="form-input-file"
                      disabled={isSubmitting}
                    />
                  </div>
                  <small className="form-hint">
                    {form.file 
                      ? `Selected: ${form.file.name} (${(form.file.size / 1024).toFixed(2)} KB)`
                      : 'Max 10MB, PDF only'
                    }
                  </small>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes (Optional)</label>
                <textarea
                  id="notes" 
                  name="notes"
                  className="form-textarea"
                  value={form.notes} 
                  onChange={handleChange}
                  placeholder="Any specific instructions or additional information..."
                  rows="3"
                  maxLength="1000"
                  disabled={isSubmitting}
                />
                <small className="form-hint">
                  {form.notes.length}/1000 characters
                </small>
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="cancel-btn" 
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="post-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
              
              {uploadStatus && (
                <div className={`status-message-box ${
                  uploadStatus.includes('success') ? 'success' : 
                  uploadStatus.includes('Uploading') ? 'info' : 'error'
                }`}>
                  {uploadStatus}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      

      {/* Details Modal */}
      {detailsModalOpen && selectedRequest && (
        <div 
          className="modal-overlay" 
          onClick={(e) => e.target.classList.contains("modal-overlay") && handleCloseDetailsModal()}
        >
          <div className="modal" style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
            <button 
              type="button" 
              className="modal-close-btn" 
              onClick={handleCloseDetailsModal}
            >
              ✖
            </button>
            <h3 className="modal-title">{selectedRequest.title}</h3>
            
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <div>
                  <span 
                    className="badge" 
                    style={{ backgroundColor: getStatusConfig(selectedRequest.status).color }}
                  >
                    {getStatusConfig(selectedRequest.status).icon}
                    <span style={{ marginLeft: '6px' }}>
                      {getStatusConfig(selectedRequest.status).label}
                    </span>
                  </span>
                </div>
              </div>
              
              <div className="detail-row">
                <span className="detail-label">Submitted On</span>
                <p className="detail-value">
                  {new Date(selectedRequest.createdAt).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>

              <div className="detail-row">
                <span className="detail-label">End Date</span>
                <p className="detail-value">
                  {selectedRequest.endDate 
                    ? new Date(selectedRequest.endDate).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : "N/A"
                  }
                </p>
              </div>
               
              <div className="detail-row">
                <span className="detail-label">File Attachment</span>
                {resolveAttachmentUrl(selectedRequest) ? (
                  <a
                    href="#"
                    className="status-action-btn status-action-btn--primary"
                    onClick={(e) => { e.preventDefault(); openProtectedUrl(resolveAttachmentUrl(selectedRequest)); }}
                  >
                    <FaFilePdf /> View Attachment
                  </a>
                ) : (
                  <p className="detail-value">No file attached</p>
                )}
              </div>

              <div className="detail-row detail-row-full">
                <span className="detail-label">Description</span>
                <p className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>
                  {selectedRequest.description}
                </p>
              </div>
              
              {selectedRequest.notes && (
                <div className="detail-row detail-row-full">
                  <span className="detail-label">Notes</span>
                  <p className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedRequest.notes}
                  </p>
                </div>
              )}
              
              {selectedRequest.adminFeedback && (
                <div className="detail-row detail-row-full feedback-box" style={{ display: 'flex', alignItems: 'flex-start', gap: '24px', background: '#f3f4f6', borderRadius: '8px', padding: '16px', marginTop: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <span className="detail-label" style={{ color: '#2563eb', fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                      <FaCheckCircle style={{ marginRight: '8px', color: '#2563eb' }} />
                      Admin Feedback
                    </span>
                    <p className="detail-value" style={{ whiteSpace: 'pre-wrap', color: '#1e293b', fontSize: '1rem', margin: 0 }}>
                      {selectedRequest.adminFeedback}
                    </p>
                  </div>
                </div>
              )}

              {/* History Section (collapsible) */}
              <div className="detail-row detail-row-full" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="detail-label">History</span>
                    <span style={{ background: '#eef2ff', color: '#1e3a8a', padding: '4px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{history.length}</span>
                    {/* latest preview */}
                    {history.length > 0 && (
                      (() => {
                        const latest = history[0];
                        const rawDetails = latest.Details || latest.details || '';
                        const { actor } = parseDetails(rawDetails);
                        const when = latest.ChangedAt || latest.changedAt || latest.changedAt;
                        const displayActor = actor && /^[0-9]+$/.test(String(actor).trim()) ? (userNames[String(actor).trim()] || `User ${String(actor).trim()}`) : actor;
                        // If the latest action is 'Created', prefer showing "Created: FullName" instead of "Last: ... By: ..."
                        const latestAction = latest.Action || latest.action || '';
                        if (/^Created$/i.test(String(latestAction))) {
                          const createdLabel = displayActor ? `Created: ${displayActor}` : 'Created';
                          return (
                            <div style={{ color: '#475569', fontSize: 13 }}>
                              {createdLabel} · <span style={{ color: '#0f172a', fontWeight: 600 }}>{timeAgo(when)}</span>
                            </div>
                          );
                        }

                        return (
                          <div style={{ color: '#475569', fontSize: 13 }}>
                            {displayActor ? `Last: ${displayActor}` : 'Last'} · <span style={{ color: '#0f172a', fontWeight: 600 }}>{timeAgo(when)}</span>
                          </div>
                        );
                      })()
                    )}
                  </div>
                  
                  <button
                    type="button"
                    className="status-action-btn"
                    onClick={() => setHistoryOpen((s) => !s)}
                    aria-expanded={historyOpen}
                    aria-controls={`history-list-${selectedRequest ? selectedRequest.id : 'none'}`}
                    style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span style={{ fontWeight: 600 }}>{historyOpen ? 'Hide History' : 'Show History'}</span>
                    {historyOpen ? <FaChevronUp /> : <FaChevronDown />}
                  </button>
                </div>
                
                {historyOpen && (
                  <div style={{ marginTop: 12, maxHeight: '50vh', overflowY: 'auto' }} id={`history-list-${selectedRequest ? selectedRequest.id : 'none'}`}>
                    {historyLoading ? (
                      <p>Loading history...</p>
                    ) : historyError ? (
                      <p style={{ color: '#b91c1c' }}>{historyError}</p>
                    ) : history.length === 0 ? (
                      <p style={{ color: '#475569' }}>No history available for this request.</p>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {history.map((h, idx) => {
                          const id = h.HistoryID || h.historyID || h.id || `history-${idx}`;
                          const when = h.ChangedAt || h.changedAt || h.changedAt;
                          const action = h.Action || h.action || '';
                          const rawDetails = h.Details || h.details || '';
                          const { actor, body } = parseDetails(rawDetails);
                          return (
                            <li key={id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid #eef2f7' }}>
                              <div style={{ width: 110, textAlign: 'right', paddingRight: 12 }}>
                                <div style={{ fontSize: 12, color: '#94a3b8' }}>{formatTimestamp(when)}</div>
                              </div>

                              <div style={{ width: 18, display: 'flex', justifyContent: 'center' }}>
                                {(() => {
                                  const act = (action || '').toString();
                                  let dotColor = '#2563eb';
                                  if (/^Created$/i.test(act)) {
                                    dotColor = '#94a3b8';
                                  } else if (/Deleted/i.test(act)) {
                                    dotColor = '#ef4444';
                                  } else {
                                    const m = act.match(/Status updated to\s+(\w+)/i);
                                    if (m && m[1]) {
                                      try {
                                        const statusCfg = getStatusConfig(m[1].toUpperCase());
                                        if (statusCfg && statusCfg.color) dotColor = statusCfg.color;
                                      } catch (e) {}
                                    }
                                  }
                                  return <div style={{ width: 10, height: 10, borderRadius: 10, background: dotColor, marginTop: 6 }} />;
                                })()}
                              </div>

                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{
                                    (/^Created$/i.test(String(action)) ? (() => {
                                      const displayActor = actor && /^[0-9]+$/.test(String(actor).trim()) ? (userNames[String(actor).trim()] || `User ${String(actor).trim()}`) : actor;
                                      return displayActor ? `Created: ${displayActor}` : 'Created';
                                    })() : action)
                                  }</div>
                                </div>

                                      {actor && !/^Created$/i.test(String(action)) && (
                                        <div style={{ marginTop: 6, fontSize: 13, color: '#1f2937' }}>
                                          <strong>By:</strong> {(/^[0-9]+$/.test(String(actor).trim()) ? (userNames[String(actor).trim()] || `User ${String(actor).trim()}`) : actor)}
                                        </div>
                                      )}

                                {body && (
                                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: '#344054' }}>
                                    {body}
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-actions">
              <button 
                className="status-action-btn" 
                onClick={handleCloseDetailsModal}
              >
                Close
              </button>
              {selectedRequest.status === "PENDING" && (
                <button 
                  className="status-action-btn status-action-btn--danger"
                  onClick={(e) => {
                    handleCloseDetailsModal();
                    handleDeleteRequest(e, selectedRequest.id);
                  }}
                >
                  <FaTrash /> Delete Request
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;