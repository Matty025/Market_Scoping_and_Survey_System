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
  FaExclamationTriangle
} from "react-icons/fa";
import "./Dashboard.css";

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
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper: Status Colors
  const getStatusConfig = (status) => {
    const s = String(status || "").toUpperCase();
    switch (s) {
      case "PENDING": return { color: "#f59e0b", icon: <FaClock />, label: "Pending Review" };
      case "COMPLETED": return { color: "#22c55e", icon: <FaCheckCircle />, label: "Completed" };
      case "REVIEWED": return { color: "#2563eb", icon: <FaCheckCircle />, label: "Reviewed" };
      case "QUOTED": return { color: "#8b5cf6", icon: <FaCheckCircle />, label: "Quoted" };
      case "REJECTED": return { color: "#ef4444", icon: <FaTimesCircle />, label: "Rejected" };
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

      const res = await fetch("http://localhost:3001/api/buyer/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });

      if (!res.ok) {
        const error = await res.json();
        setUploadStatus(error.error || "Upload failed.");
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
      if (!token) return;
      
      try {
        const res = await fetch("http://localhost:3001/api/buyer/requests", {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (res.ok) {
          const data = await res.json();
          setRequests(data.requests || []);
        }
      } catch (err) {
        console.error("Fetch error", err);
      }
    };
    
    fetchRequests();
  }, [refreshKey]);

  const handleViewDetails = (request) => {
    setSelectedRequest(request);
    setDetailsModalOpen(true);
  };

  const handleCloseDetailsModal = () => {
    setDetailsModalOpen(false);
    setSelectedRequest(null);
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
      const res = await fetch(`http://localhost:3001/api/buyer/requests/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setDeleteStatus("Request deleted successfully.");
        setRefreshKey(old => old + 1);
        setTimeout(() => setDeleteStatus(""), 3000);
      } else {
        setDeleteStatus(data.error || "Failed to delete request.");
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

  return (
    <div className="dashboard-container">
      {/* Header Section */}
      <div className="dashboard-header">
        <span className="dashboard-header-tagline">Buyer Console</span>
        <h2>Dashboard Overview</h2>
        <p>Submit procurement requests and send survey items to admin for approval.</p>
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

          {requests.length === 0 ? (
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
              {requests.map((req) => {
                const statusConfig = getStatusConfig(req.status);
                const fullFileUrl = req.fileUrl ? `http://localhost:3001${req.fileUrl}` : '#';
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
                      {req.filePath && (
                        <a
                          href={fullFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="badge badge-file"
                          onClick={(e) => e.stopPropagation()}
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
          <div className="modal" style={{ maxWidth: '700px' }}>
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
                {selectedRequest.filePath ? (
                  <a
                    href={selectedRequest.fileUrl ? `http://localhost:3001${selectedRequest.fileUrl}` : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="status-action-btn status-action-btn--primary"
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
                <div className="detail-row detail-row-full feedback-box">
                  <span className="detail-label">
                    <FaCheckCircle style={{ marginRight: '6px' }} />
                    Admin Feedback
                  </span>
                  <p className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedRequest.adminFeedback}
                  </p>
                </div>
              )}
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