import React, { useState } from "react";
import api from "../api";
import "./FileCardModal.css";

const FileCardModal = ({
  file,
  onClose,
  onSubmit,
  onRequireFile,
  isSubmitting,
  canSubmit = true,
  onOptIn,
  onDecline,
  onViewHistory,
  isDecisionPending = false,
  decisionAction = null,
}) => {
  const [uploadFile, setUploadFile] = useState(null);

  const handleSubmit = async () => {
    if (!effectiveCanSubmit) {
      return;
    }
    if (!uploadFile) {
      onRequireFile?.();
      return;
    }
    const success = await onSubmit(file, uploadFile);
    if (success) {
      setUploadFile(null);
    }
  };

  const statusLabel = file.statusDisplay || file.Status || "Pending";
  const badgeClass = (file.statusClass || statusLabel.toLowerCase()).replace(/\s+/g, "-");
  // Prefer server-provided SAS URLs if available, otherwise fall back to stored filePath
  const sanitizedPath = (file.fileUrl || file.filePath) ? (file.fileUrl || file.filePath).replace(/\\/g, "/") : null;
  const optInStatus = file.optInStatus || "PENDING";
  const requiresDecision = Boolean(file.requiresDecision);
  const hasDecisionActions = Boolean(file.hasDecisionActions);
  const lastResponse = file.lastResponse;
  const makeUrl = (p) => {
    if (!p) return null;
    const normalized = String(p).replace(/\\/g, "/");
    if (/^https?:\/\//i.test(normalized)) return normalized;
    const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    return `${base}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
  };
  // Prefer backend streaming endpoint for the last response (enforces ownership).
  // Fallback to server-provided SAS or stored filePath if streaming endpoint isn't available.
  const responseStreamUrl = file && file.SupplierFileID ? makeUrl(`/api/supplier-files/${file.SupplierFileID}/response-file`) : null;
  const lastResponseUrl = responseStreamUrl || (lastResponse?.lastResponseFileUrl ? lastResponse.lastResponseFileUrl : (lastResponse?.filePath ? makeUrl(lastResponse.filePath) : null));

  const openProtectedUrl = async (url) => {
    if (!url) return;
    try {
      // If it's an Azure blob URL without SAS, request SAS from backend
      if (/\.blob\.core\.windows\.net\//i.test(url) && !url.includes('?')) {
        const resp = await api.get('/api/files/sas', { params: { blobUrl: url } });
        const sas = resp.data?.url || url;
        window.open(sas, '_blank');
        return;
      }
      window.open(url, '_blank');
    } catch (err) {
      console.error('Failed to open protected URL', err);
      window.open(url, '_blank');
    }
  };
  const lastResponseTimestamp = lastResponse?.uploadedAt instanceof Date && !Number.isNaN(lastResponse.uploadedAt.getTime())
    ? lastResponse.uploadedAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const decisionBusy = Boolean(isDecisionPending);
  const isJoinBusy = decisionBusy && decisionAction === "opt-in";
  const isDeclineBusy = decisionBusy && decisionAction === "decline";
  const effectiveCanSubmit = Boolean(canSubmit);
  const fileInputDisabled = !effectiveCanSubmit || decisionBusy;
  const showHistoryButton = typeof onViewHistory === "function";

  const handleJoinAttempt = () => {
    if (typeof onOptIn === "function") {
      onOptIn(file);
    }
  };

  const handleDeclineAttempt = () => {
    if (typeof onDecline === "function") {
      onDecline(file);
    }
  };

  const handleViewHistory = () => {
    if (typeof onViewHistory === "function") {
      onViewHistory(file);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container">
        <h2>📄 {file.Title}</h2>
        <p>{file.Description}</p>
        <div className="modal-file-dates">
          <span>
            <strong>Date Posted:</strong>{" "}
            {new Date(file.datePosted || file.dateSent).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
          {(file.EndDate || file.endDate) && (
            <span className="deadline-date">
              <strong>Deadline:</strong>{" "}
              {new Date(file.EndDate || file.endDate).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
        </div>
        <span className={`status-badge ${badgeClass}`}>
          {statusLabel}
        </span>
        {showHistoryButton && (
          <button
            type="button"
            className="history-btn inline"
            onClick={handleViewHistory}
            disabled={decisionBusy}
          >
            View Status Timeline
          </button>
        )}

        {hasDecisionActions && (
          <div className="modal-decision-block">
            <h3>{optInStatus === "DECLINED" ? "You declined this attempt" : "Join this attempt?"}</h3>
            <p>
              {optInStatus === "DECLINED"
                ? "You previously declined this round. You can change your mind below."
                : "Let us know if you want to stay in for this round."}
            </p>
            {lastResponseTimestamp && (
              <p className="modal-decision-subtext">
                Last submission: {lastResponseTimestamp}
                {lastResponseUrl && (
                  <>
                    {" • "}
                    <a href="#" onClick={(e) => { e.preventDefault(); openProtectedUrl(lastResponseUrl); }} target="_blank" rel="noopener noreferrer">
                      View PDF
                    </a>
                  </>
                )}
              </p>
            )}
            <div className="modal-decision-buttons">
              <button
                type="button"
                className="decision-btn primary"
                onClick={handleJoinAttempt}
                disabled={decisionBusy || typeof onOptIn !== "function"}
              >
                {isJoinBusy ? "Saving..." : "Yes, I'll join"}
              </button>
              <button
                type="button"
                className="decision-btn secondary"
                onClick={handleDeclineAttempt}
                disabled={decisionBusy || typeof onDecline !== "function"}
              >
                {isDeclineBusy ? "Updating..." : "No, skip this round"}
              </button>
            </div>
          </div>
        )}

        {optInStatus === "OPTED_IN" && !hasDecisionActions && (
          <div className="modal-decision-block info">
            <p>You have opted in. Upload your updated quotation to complete this attempt.</p>
          </div>
        )}

        {optInStatus === "SUBMITTED" && !hasDecisionActions && (
          <div className="modal-decision-block info">
            <p>Quotation submitted for this attempt.</p>
            {lastResponseTimestamp && (
              <p className="modal-decision-subtext">
                Submitted on {lastResponseTimestamp}
                {lastResponseUrl && (
                  <>
                    {" • "}
                    <a href="#" onClick={(e) => { e.preventDefault(); openProtectedUrl(lastResponseUrl); }} target="_blank" rel="noopener noreferrer">
                      View PDF
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {!effectiveCanSubmit && !requiresDecision && optInStatus !== "DECLINED" && (
          <p className="submission-locked">Submission period has ended. You can still view the announcement PDF.</p>
        )}

        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setUploadFile(e.target.files[0])}
          disabled={fileInputDisabled}
        />

        <div className="modal-buttons">
          {sanitizedPath ? (
            (
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); openProtectedUrl(makeUrl(sanitizedPath)); }}
                className="download-btn"
              >
                📄 View PDF
              </a>
            )
          ) : (
            <button type="button" className="download-btn" disabled>
              PDF Unavailable
            </button>
          )}
          <button
            type="button"
            className="submit-btn"
            onClick={handleSubmit}
            disabled={!effectiveCanSubmit || isSubmitting || decisionBusy}
          >
            {!effectiveCanSubmit ? "Submission Closed" : isSubmitting ? "Submitting..." : "Submit PDF"}
          </button>
          <button type="button" className="close-btn-FC" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileCardModal;
