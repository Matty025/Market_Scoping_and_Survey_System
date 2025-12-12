import React, { useState } from "react";
import api from "../api";
import { useAuth } from "./AuthContext";
import "./ResponseModal.css";

const ResponseModal = ({ announcement, responses, onClose, isLoading }) => {
  const { token } = useAuth(); // token must be here
  const [historyViewer, setHistoryViewer] = useState({ visible: false, supplierName: "", files: [] });

  const formatDateTime = (value, options = {}) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        ...options,
      });
    } catch (err) {
      return "—";
    }
  };

  const formatStatusLabel = (status) => {
    if (!status) return "Unknown";
    return String(status)
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  };

  const deriveRowStatus = (row) => {
    const optIn = row.optInStatus ? String(row.optInStatus).toUpperCase() : "";
    const supplierFileStatus = row.supplierFileStatus ? String(row.supplierFileStatus).toUpperCase() : "";

    if (optIn === "DECLINED") {
      return "Declined";
    }
    if (optIn === "PENDING") {
      return "Pending Decision";
    }
    if (optIn === "OPTED_IN" && !row.responseFilePath) {
      return "Opted In";
    }
    if (optIn === "SUBMITTED") {
      return row.isReused ? "Submitted (Reused)" : "Submitted";
    }
    if (supplierFileStatus === "ANSWERED" && row.responseFilePath) {
      return row.isReused ? "Answered (Reused)" : "Answered";
    }
    if (row.responseFilePath) {
      return "Submitted";
    }
    return "No Response";
  };

  const resolveActivityDate = (row) =>
    row.dateUploaded || row.lastReusedAt || row.dateResponded || row.optedInAt || row.declinedAt;

  const formatAttempt = (rowAttempt, fallbackAttempt) => {
    if (Number.isInteger(rowAttempt) && rowAttempt > 0) {
      return `#${rowAttempt}`;
    }
    if (Number.isInteger(fallbackAttempt) && fallbackAttempt > 0) {
      return `#${fallbackAttempt}`;
    }
    return "—";
  };

  const downloadAllQuotations = async () => {
    if (!token) {
      alert("You are not authorized.");
      return;
    }

    try {
      const params = {};
      if (announcement?.attemptNumber) {
        params.attemptNumber = announcement.attemptNumber;
      }
      const res = await api.get(`/api/admin/announcements/${announcement.id}/download-all`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
        responseType: "blob",
      });

      const fileNameParts = ["Quotations"];
      if (announcement?.procurementId) {
        fileNameParts.push(`P${announcement.procurementId}`);
      } else {
        fileNameParts.push(`File${announcement.id}`);
      }
      if (announcement?.attemptNumber) {
        fileNameParts.push(`Attempt${announcement.attemptNumber}`);
      } else if (announcement?.attemptId) {
        fileNameParts.push(`Attempt${announcement.attemptId}`);
      }

      const downloadName = `${fileNameParts.join("_")}.zip`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", downloadName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to download quotations.");
    }
  };

  const buildFileUrl = (filePath) => {
    if (!filePath) return null;
    const normalized = String(filePath).replace(/\\/g, "/");
    if (/^https?:\/\//i.test(normalized)) return normalized;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    return `${base}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
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

  const openHistoryViewer = (supplierName, files = []) => {
    const safeFiles = Array.isArray(files) ? files : [];
    setHistoryViewer({ visible: true, supplierName, files: safeFiles });
  };

  const closeHistoryViewer = () => {
    setHistoryViewer({ visible: false, supplierName: "", files: [] });
  };

  const attemptLabel = announcement?.attemptNumber ? `#${announcement.attemptNumber}` : "—";
  const attemptStatusLabel = formatStatusLabel(announcement?.attemptStatus || "");
  const procurementStatusLabel = formatStatusLabel(announcement?.procurementStatus || "");
  const attemptSentLabel = formatDateTime(announcement?.attemptSentAt);
  const attemptDueLabel = formatDateTime(announcement?.attemptDueAt, { hour: undefined, minute: undefined });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          ✖
        </button>

        <h3>Responses for: {announcement.title}</h3>
        <p>{announcement.description}</p>
        <div style={{ background: "#f3f4f6", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
          <p><strong>Attempt:</strong> {attemptLabel} • {attemptStatusLabel}</p>
          <p><strong>Procurement Status:</strong> {procurementStatusLabel}</p>
          <p><strong>Sent:</strong> {attemptSentLabel} • <strong>Due:</strong> {attemptDueLabel}</p>
        </div>

        {/* Actions */}
        <div className="response-modal-actions">
          <button
            className="abstract-btn"
            onClick={downloadAllQuotations}
          >
            📦 Download All Quotations (ZIP)
          </button>
        </div>

        <div className="response-list">
          {isLoading ? (
            <p>Loading responses...</p>
          ) : responses.length === 0 ? (
            <p>No suppliers have responded yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th>Attempt</th>
                  <th>Last Activity</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((res, index) => {
                  const statusLabel = deriveRowStatus(res);
                  const normalizedStatusClass = statusLabel
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                  return (
                    <tr key={index}>
                      <td>{res.companyName}</td>
                      <td>
                        <span className={`status-chip status-${normalizedStatusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                      <td>{formatAttempt(res.currentAttemptNumber, announcement?.attemptNumber)}</td>
                      <td>{formatDateTime(resolveActivityDate(res))}</td>
                      <td>
                        {(() => {
                          const historyList = Array.isArray(res.responseHistory) ? res.responseHistory : [];
                          const latestFileUrl = buildFileUrl(res.responseFilePath);
                          if (latestFileUrl) {
                            return (
                              <div className="response-file-actions">
                                <a
                                  href="#"
                                  onClick={(e) => { e.preventDefault(); openProtectedUrl(latestFileUrl); }}
                                  className="download-btn"
                                >
                                  View Latest Quotation
                                </a>
                                {historyList.length > 0 && (
                                  <button
                                    type="button"
                                    className="view-history-btn"
                                    onClick={() => openHistoryViewer(res.companyName, historyList)}
                                  >
                                    View Files
                                  </button>
                                )}
                              </div>
                            );
                          }

                          if (historyList.length > 0) {
                            return (
                              <button
                                type="button"
                                className="view-history-btn"
                                onClick={() => openHistoryViewer(res.companyName, historyList)}
                              >
                                View Previous Files
                              </button>
                            );
                          }

                          return <span className="download-placeholder">—</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {historyViewer.visible && (
          <div className="response-history-overlay" onClick={closeHistoryViewer}>
            <div className="response-history-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="modal-close-btn" onClick={closeHistoryViewer}>
                ✖
              </button>
              <h4>Supplier Files — {historyViewer.supplierName}</h4>
              {historyViewer.files.length === 0 ? (
                <p className="response-history-empty">No uploaded quotations yet.</p>
              ) : (
                <ul className="response-history-list">
                  {historyViewer.files.map((file, idx) => {
                    const attemptNumber = Number.isInteger(file?.attemptIndex) ? file.attemptIndex : null;
                    const attemptLabelRendered = attemptNumber ? `Attempt #${attemptNumber}` : formatAttempt(file?.attemptIndex, null);
                    const fileUrl = buildFileUrl(file?.responseFilePath || "");
                    return (
                      <li key={file?.responseId || idx} className="response-history-item">
                        <div className="response-history-meta">
                          <span className="response-history-attempt">{attemptLabelRendered}</span>
                          <span className="response-history-date">{formatDateTime(file?.dateUploaded)}</span>
                          {file?.isReused ? <span className="response-history-tag">Reused</span> : null}
                        </div>
                          {fileUrl ? (
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); openProtectedUrl(fileUrl); }}
                            className="download-btn"
                          >
                            View File
                          </a>
                        ) : (
                          <span className="download-placeholder">No file</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResponseModal;
