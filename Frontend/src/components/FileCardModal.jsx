import React, { useState } from "react";
import "./FileCardModal.css";

const FileCardModal = ({ file, onClose, onSubmit, onRequireFile, isSubmitting, canSubmit = true }) => {
  const [uploadFile, setUploadFile] = useState(null);

  const handleSubmit = async () => {
    if (!canSubmit) {
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
  const sanitizedPath = file.filePath ? file.filePath.replace(/\\/g, "/") : null;

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

        {!canSubmit && (
          <p className="submission-locked">Submission period has ended. You can still view the announcement PDF.</p>
        )}

        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setUploadFile(e.target.files[0])}
          disabled={!canSubmit}
        />

        <div className="modal-buttons">
          {sanitizedPath ? (
            <a
              href={`http://localhost:3001/${sanitizedPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="download-btn"
            >
              📄 View PDF
            </a>
          ) : (
            <button type="button" className="download-btn" disabled>
              PDF Unavailable
            </button>
          )}
          <button type="button" className="submit-btn" onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            {!canSubmit ? "Submission Closed" : isSubmitting ? "Submitting..." : "Submit PDF"}
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
