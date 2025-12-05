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
  FaDownload 
} from "react-icons/fa";
import "./Dashboard.css"; // Renamed CSS import

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
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0); // To trigger re-fetch

  // --- Helper: Status Colors ---
  const getStatusConfig = (status) => {
    const s = String(status || "").toUpperCase();
    switch (s) {
      case "PENDING": return { color: "#f59e0b", icon: <FaClock /> };
      case "COMPLETED": return { color: "#22c55e", icon: <FaCheckCircle /> };
      case "REVIEWED": return { color: "#2563eb", icon: <FaCheckCircle /> };
      case "REJECTED": return { color: "#ef4444", icon: <FaTimesCircle /> };
      default: return { color: "#6b7280", icon: <FaClock /> };
    }
  };

  const handleOpenModal = () => {
    setShowModal(true);
    setUploadStatus("");
    setForm({ title: "", description: "", notes: "", endDate: "", file: null });
  };

  const handleCloseModal = () => setShowModal(false);

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "file" ? files[0] : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.endDate || !form.file) {
      setUploadStatus("Please fill all fields and select a file.");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      setUploadStatus("You are not logged in. Please log in first.");
      return;
    }

    setUploadStatus("Uploading...");

    try {
      const data = new FormData();
      data.append("title", form.title);
      data.append("description", form.description);
      data.append("notes", form.notes);
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
        return;
      }

      setUploadStatus("Purchase request sent successfully.");
      setShowModal(false);
      setRefreshKey(old => old + 1); // Refresh list
    } catch (err) {
      console.error("Upload error:", err);
      setUploadStatus("Server error. Please try again.");
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
  }, [refreshKey, deleteStatus]); // Refresh when upload happens or delete happens

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
    setDeleteStatus("");
    if(!window.confirm("Are you sure you want to delete this request?")) return;

    try {
      const res = await fetch(`http://localhost:3001/api/buyer/requests/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDeleteStatus(`Request ${id} deleted.`);
        setRefreshKey(old => old + 1);
      } else {
        setDeleteStatus("Failed to delete request.");
      }
    } catch (err) {
      setDeleteStatus("Server error.");
    }
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
              {deleteStatus && <span className="status-message">{deleteStatus}</span>}
            </div>
          </div>

          {requests.length === 0 ? (
             <div className="no-requests">
               <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                 <p>No requests submitted yet.</p>
               </div>
             </div>
          ) : (
            <div className="announcements-container">
              {requests.map((req) => {
                const statusConfig = getStatusConfig(req.status);                
                const fullFileUrl = req.fileUrl ? `http://localhost:3001${req.fileUrl}` : '#';
                
                return (
                  <div key={req.id} className="announcement-card" onClick={() => handleViewDetails(req)}>
                    <div className="announcement-header">
                      <h4>{req.title}</h4>
                      <div className="announcement-header-right">
                         <span className="badge" style={{ backgroundColor: statusConfig.color }}>
                            {statusConfig.icon} <span style={{marginLeft: '4px'}}>{req.status}</span>
                         </span>
                      </div>
                    </div>

                    <div className="announcement-metadata">
                      <span className="badge badge-date">
                        <FaCalendarAlt /> Due: {req.endDate && !isNaN(new Date(req.endDate)) ? new Date(req.endDate).toLocaleDateString() : '-'}
                      </span>
                      {/* FILE BUTTON IN CARD */}
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
                      <p className="announcement-preview-summary">{req.description}</p>
                    </div>

                    <div className="announcement-status-bar">
                      <div className="status-pill-group">
                         <span className="status-pill-text">Submitted: {new Date(req.createdAt).toLocaleDateString()}</span>
                      </div>
                      
                      <div className="status-action-group">
                        <button 
                          className="status-action-btn status-action-btn--primary"
                          onClick={(e) => { e.stopPropagation(); handleViewDetails(req); }}
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
        <div className="modal-overlay" onClick={(e) => e.target.classList.contains("modal-overlay") && handleCloseModal()}>
          <div className="modal">
            <button type="button" className="modal-close-btn" onClick={handleCloseModal}>✖</button>
            <h3 className="modal-title">Create Purchase Request</h3>
            
            <form onSubmit={handleSubmit} className="purchase-request-form">
              <div className="form-group">
                <label htmlFor="title">Title</label>
                <input
                  type="text" id="title" name="title"
                  className="form-input"
                  value={form.title} onChange={handleChange} required
                  placeholder="e.g. IT Equipment Procurement"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description" name="description"
                  className="form-textarea"
                  value={form.description} onChange={handleChange} required
                  placeholder="Brief summary of the request..."
                />
              </div>
              
              <div className="form-group-row">
                <div className="form-group half">
                    <label htmlFor="endDate">End Date</label>
                    <input
                      type="date" id="endDate" name="endDate"
                      className="form-input"
                      value={form.endDate} onChange={handleChange} required
                    />
                </div>
                <div className="form-group half">
                    <label htmlFor="file">Attachment (PDF)</label>
                    <div className="file-input-wrapper">
                        <input
                        type="file" id="file" name="file"
                        accept=".pdf"
                        onChange={handleChange} required
                        className="form-input-file"
                        />
                    </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes (Optional)</label>
                <textarea
                  id="notes" name="notes"
                  className="form-textarea"
                  value={form.notes} onChange={handleChange}
                  placeholder="Any specific instructions..."
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="post-btn">
                   Submit Request
                </button>
              </div>
              
              {uploadStatus && (
                <div className="status-message-box">
                  {uploadStatus}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailsModalOpen && selectedRequest && (
        <div className="modal-overlay" onClick={(e) => e.target.classList.contains("modal-overlay") && handleCloseDetailsModal()}>
          <div className="modal">
            <button type="button" className="modal-close-btn" onClick={handleCloseDetailsModal}>✖</button>
            <h3 className="modal-title">{selectedRequest.title}</h3>
            
            <div className="detail-grid">
               <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <div>
                    <span className="badge" style={{ backgroundColor: getStatusConfig(selectedRequest.status).color }}>
                      {selectedRequest.status}
                    </span>
                  </div>
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
                      <FaEye /> View Attachment
                    </a>
                  ) : (
                    <p className="detail-value">No file attached</p>
                  )}
               </div>

               <div className="detail-row">
                  <span className="detail-label">Description</span>
                  <p className="detail-value">{selectedRequest.description}</p>
               </div>
               <div className="detail-row">
                  <span className="detail-label">Notes</span>
                  <p className="detail-value">{selectedRequest.notes || "No notes provided."}</p>
               </div>
               <div className="detail-row">
                  <span className="detail-label">End Date</span>
                  <p className="detail-value">{selectedRequest.endDate ? new Date(selectedRequest.endDate).toLocaleDateString() : "N/A"}</p>
               </div>
               {selectedRequest.adminFeedback && (
                 <div className="detail-row feedback-box">
                    <span className="detail-label">Admin Feedback</span>
                    <p className="detail-value">{selectedRequest.adminFeedback}</p>
                 </div>
               )}
            </div>
            
            <div className="modal-actions">
               <button className="status-action-btn" onClick={handleCloseDetailsModal}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;