import React, { useState } from "react";
import "./FileCardModal.css";

const FileCardModal = ({ file, onClose, onSubmit }) => {
  const [uploadFile, setUploadFile] = useState(null);

  const handleSubmit = () => {
    if (!uploadFile) {
      alert("Please upload your answered PDF.");
      return;
    }
    onSubmit(file, uploadFile);
    setUploadFile(null);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-container">
        <h2>📄 {file.Title}</h2>
        <p>{file.Description}</p>
        <p>
          Date Posted:{" "}
          {new Date(file.datePosted).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <span className={`status-badge ${file.Status.toLowerCase()}`}>
          {file.Status}
        </span>

        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setUploadFile(e.target.files[0])}
        />

        <div className="modal-buttons">
          <a
            href={`http://localhost:3001/${file.filePath.replace(/\\/g, '/')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="download-btn"
          >
            📄 View PDF
          </a>
          <button className="submit-btn" onClick={handleSubmit}>
            Submit PDF
          </button>
          <button className="close-btn-FC" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileCardModal;
