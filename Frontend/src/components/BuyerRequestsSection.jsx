import React, { useState, useEffect } from 'react';
import api from '../api';
import { FaFilePdf, FaUser, FaCalendar, FaCheckCircle, FaClock, FaTimesCircle } from 'react-icons/fa';

const BuyerRequestsSection = ({ token, toast, setToast, noWrapper = false }) => {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: '', feedback: '' });
  const [isUpdating, setIsUpdating] = useState(false);
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({ pending: 0, reviewed: 0, inProgress: 0, completed: 0, rejected: 0, total: 0 });

  const STATUS_CONFIG = {
    PENDING: { color: '#f59e0b', label: 'Pending Review', icon: <FaClock /> },
    REVIEWED: { color: '#2563eb', label: 'Reviewed', icon: <FaCheckCircle /> },
    IN_PROGRESS: { color: '#8b5cf6', label: 'In Progress', icon: <FaClock /> },
    COMPLETED: { color: '#22c55e', label: 'Completed', icon: <FaCheckCircle /> },
    REJECTED: { color: '#ef4444', label: 'Rejected', icon: <FaTimesCircle /> },
  };

  useEffect(() => {
    fetchRequests();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, searchQuery]);

  const fetchStats = async () => {
    try {
      const response = await api.get('/api/admin/buyer-requests/stats/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data || {});
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchRequests = async () => {
    setIsLoading(true);
    try {
      const params = {};
      if (filterStatus !== 'All') params.status = filterStatus;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const response = await api.get('/api/admin/buyer-requests', {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      setRequests(response.data.items || []);
    } catch (err) {
      console.error('Failed to fetch buyer requests:', err);
      setToast && setToast({ visible: true, type: 'error', message: 'Failed to load purchase requests' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = (request) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
  };

  const handleOpenStatusModal = (request) => {
    setSelectedRequest(request);
    setStatusForm({ status: request.status, feedback: request.adminFeedback || '' });
    setShowStatusModal(true);
  };

  const handleUpdateStatus = async () => {
    if (!statusForm.status) {
      setToast && setToast({ visible: true, type: 'warning', message: 'Please select a status' });
      return;
    }

    setIsUpdating(true);
    try {
      await api.patch(`/api/admin/buyer-requests/${selectedRequest.id}/status`, statusForm, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setToast && setToast({ visible: true, type: 'success', message: 'Status updated successfully' });
      setShowStatusModal(false);
      fetchRequests();
      fetchStats();
    } catch (err) {
      console.error('Failed to update status:', err);
      setToast && setToast({ visible: true, type: 'error', message: err.response?.data?.message || 'Failed to update status' });
    } finally {
      setIsUpdating(false);
    }
  };

  const getFileUrl = (filePath) => {
    if (!filePath) return '#';
    if (filePath.startsWith('http')) return filePath;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    return `${base}${filePath}`;
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
          const absoluteUrl = url.startsWith('http') ? url : `${backendBase}${url.startsWith('/') ? '' : '/'}${url}`;
          const resp = await api.get(absoluteUrl.replace(backendBase, ''), { responseType: 'blob' });
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

  const inner = (
    <div>
      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 15, marginBottom: 20 }}>
          <div style={{ padding: 15, background: '#fef3c7', borderRadius: 8, border: '1px solid #fbbf24' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#92400e' }}>{stats.pending}</div>
            <div style={{ fontSize: 14, color: '#78350f' }}>Pending Review</div>
          </div>
          <div style={{ padding: 15, background: '#dbeafe', borderRadius: 8, border: '1px solid #3b82f6' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1e40af' }}>{stats.reviewed}</div>
            <div style={{ fontSize: 14, color: '#1e3a8a' }}>Reviewed</div>
          </div>
          <div style={{ padding: 15, background: '#e0e7ff', borderRadius: 8, border: '1px solid #8b5cf6' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#5b21b6' }}>{stats.inProgress}</div>
            <div style={{ fontSize: 14, color: '#4c1d95' }}>In Progress</div>
          </div>
          <div style={{ padding: 15, background: '#dcfce7', borderRadius: 8, border: '1px solid #22c55e' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#166534' }}>{stats.completed}</div>
            <div style={{ fontSize: 14, color: '#14532d' }}>Completed</div>
          </div>
          <div style={{ padding: 15, background: '#fee2e2', borderRadius: 8, border: '1px solid #ef4444' }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', color: '#991b1b' }}>{stats.rejected}</div>
            <div style={{ fontSize: 14, color: '#7f1d1d' }}>Rejected</div>
          </div>
        </div>

        {/* Filters */}
        <div className="dashboard-filters" style={{ marginBottom: 20 }}>
          <div className="filters-left" />
          <div className="filters-right">
            <input type="text" placeholder="Search by title, buyer name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="filter-input" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="filter-select">
              <option value="All">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="REVIEWED">Reviewed</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
            {(searchQuery || filterStatus !== 'All') && (
              <button type="button" className="see-more-btn" onClick={() => { setSearchQuery(''); setFilterStatus('All'); }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Requests list */}
        {isLoading ? (
          <p>Loading purchase requests...</p>
        ) : requests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
            <p>No purchase requests found.</p>
          </div>
        ) : (
          <div className="announcements-container">
            {requests.map((request) => {
              const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.PENDING;
              return (
                <div key={request.id} className="announcement-card" style={{ cursor: 'pointer' }} onClick={() => handleViewDetails(request)}>
                  <div className="announcement-header">
                    <h4>{request.title}</h4>
                    <div className="announcement-header-right">
                      <span className="badge" style={{ backgroundColor: statusConfig.color }}>
                        {statusConfig.icon} <span style={{ marginLeft: 4 }}>{statusConfig.label}</span>
                      </span>
                    </div>
                  </div>

                  <div className="announcement-metadata">
                    <span className="badge" style={{ backgroundColor: '#6b7280' }}><FaUser /> {request.buyerName}</span>
                    <span className="badge badge-date"><FaCalendar /> Due: {request.endDate ? new Date(request.endDate).toLocaleDateString() : 'N/A'}</span>
                    {request.filePath && (
                      <a href="#" onClick={(e) => { e.stopPropagation(); e.preventDefault(); openProtectedUrl(getFileUrl(request.filePath)); }} className="badge badge-file">
                        <FaFilePdf /> View File
                      </a>
                    )}
                  </div>

                  <div className="announcement-preview">
                    <p className="announcement-preview-summary">
                      {request.description && request.description.length > 150 ? `${request.description.substring(0, 150)}...` : request.description}
                    </p>
                  </div>

                  <div className="announcement-status-bar">
                    <div className="status-pill-group">
                      <span className="status-pill-text">Submitted: {request.dateUploaded ? new Date(request.dateUploaded).toLocaleDateString() : 'N/A'}</span>
                    </div>
                    <div className="status-action-group">
                      <button className="status-action-btn status-action-btn--primary" onClick={(e) => { e.stopPropagation(); handleViewDetails(request); }}>
                        View Details
                      </button>
                      <button className="status-action-btn" onClick={(e) => { e.stopPropagation(); handleOpenStatusModal(request); }}>
                        Update Status
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* Detail modal */}
      {showDetailModal && selectedRequest && (
        <div className="modal-overlay" onClick={(e) => e.target.classList.contains('modal-overlay') && setShowDetailModal(false)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <button type="button" className="modal-close-btn" onClick={() => setShowDetailModal(false)}>✖</button>
            <h3 className="modal-title">{selectedRequest.title}</h3>
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="badge" style={{ backgroundColor: STATUS_CONFIG[selectedRequest.status]?.color }}>
                  {STATUS_CONFIG[selectedRequest.status]?.icon}
                  <span style={{ marginLeft: 6 }}>{STATUS_CONFIG[selectedRequest.status]?.label}</span>
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Buyer</span>
                <p className="detail-value">{selectedRequest.buyerName} ({selectedRequest.buyerEmail})</p>
              </div>
              <div className="detail-row">
                <span className="detail-label">Submitted On</span>
                <p className="detail-value">{selectedRequest.dateUploaded ? new Date(selectedRequest.dateUploaded).toLocaleString() : 'N/A'}</p>
              </div>
              <div className="detail-row">
                <span className="detail-label">Deadline</span>
                <p className="detail-value">{selectedRequest.endDate ? new Date(selectedRequest.endDate).toLocaleDateString() : 'N/A'}</p>
              </div>
              <div className="detail-row">
                <span className="detail-label">Attachment</span>
                {selectedRequest.filePath ? (
                  <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openProtectedUrl(getFileUrl(selectedRequest.filePath)); }} className="status-action-btn status-action-btn--primary">
                    <FaFilePdf /> View PDF
                  </a>
                ) : (
                  <p className="detail-value">No file attached</p>
                )}
              </div>
              <div className="detail-row detail-row-full">
                <span className="detail-label">Description</span>
                <p className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{selectedRequest.description}</p>
              </div>
              {selectedRequest.notes && (
                <div className="detail-row detail-row-full">
                  <span className="detail-label">Buyer Notes</span>
                  <p className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{selectedRequest.notes}</p>
                </div>
              )}
              {selectedRequest.adminFeedback && (
                <div className="detail-row detail-row-full feedback-box">
                  <span className="detail-label"><FaCheckCircle style={{ marginRight: 6 }} />Admin Feedback</span>
                  <p className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{selectedRequest.adminFeedback}</p>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="status-action-btn" onClick={() => setShowDetailModal(false)}>Close</button>
              <button className="status-action-btn status-action-btn--primary" onClick={() => { setShowDetailModal(false); handleOpenStatusModal(selectedRequest); }}>Update Status</button>
            </div>
          </div>
        </div>
      )}

      {/* Status modal */}
      {showStatusModal && selectedRequest && (
        <div className="modal-overlay" onClick={(e) => e.target.classList.contains('modal-overlay') && setShowStatusModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <button type="button" className="modal-close-btn" onClick={() => setShowStatusModal(false)}>✖</button>
            <h3 className="modal-title">Update Request Status</h3>
            <div className="form-group">
              <label htmlFor="status">Status <span className="required">*</span></label>
              <select id="status" className="form-input" value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })} disabled={isUpdating}>
                <option value="PENDING">Pending Review</option>
                <option value="REVIEWED">Reviewed</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="feedback">Admin Feedback</label>
              <textarea id="feedback" className="form-textarea" rows={5} value={statusForm.feedback} onChange={(e) => setStatusForm({ ...statusForm, feedback: e.target.value })} placeholder="Provide feedback to the buyer about this request..." disabled={isUpdating} />
              <small className="form-hint">This feedback will be visible to the buyer</small>
            </div>
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={() => setShowStatusModal(false)} disabled={isUpdating}>Cancel</button>
              <button type="button" className="post-btn" onClick={handleUpdateStatus} disabled={isUpdating}>{isUpdating ? 'Updating...' : 'Update Status'}</button>
            </div>
          </div>
        </div>
      )}
        </div>
      );

  if (noWrapper) {
    return inner;
  }

  return (
    <div className="collapsible-section" style={{ marginTop: '30px' }}>
      <div className="collapsible-header">
        <h4>🛒 Purchase Requests from Buyers ({stats.total})</h4>
      </div>
      <div className="collapsible-content">{inner}</div>
    </div>
  );
};

export default BuyerRequestsSection;
