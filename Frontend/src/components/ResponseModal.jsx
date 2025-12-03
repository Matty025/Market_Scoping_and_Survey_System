import React from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import "./ResponseModal.css";

const ResponseModal = ({ announcement, responses, onClose, isLoading, onShowHistory, historyLoading }) => {
  const { token } = useAuth(); // token must be here

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
      const res = await axios.get(
        `http://localhost:3001/api/admin/announcements/${announcement.id}/download-all`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params,
          responseType: "blob", // important for ZIP/binary files
        }
      );

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
          {typeof onShowHistory === "function" ? (
            <button
              type="button"
              className="abstract-btn secondary"
              onClick={() => onShowHistory(announcement)}
              disabled={Boolean(historyLoading)}
            >
              {historyLoading ? "Loading history…" : "📜 View Status Timeline"}
            </button>
          ) : null}
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
                        {res.responseFilePath ? (
                          <a
                            href={`http://localhost:3001/${res.responseFilePath.replace(/\\/g, "/")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="download-btn"
                          >
                            View Quotation
                          </a>
                        ) : (
                          <span className="download-placeholder">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResponseModal;
