import React, { useState } from "react";
import "./UploadProducts.css";

const UploadProducts = () => {
  const [uploadHistory] = useState([
    { id: 1, fileName: "products_october.csv", date: "2025-10-25", status: "Completed" },
    { id: 2, fileName: "products_november.xlsx", date: "2025-11-09", status: "Processing" },
  ]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      alert(`✅ File "${file.name}" uploaded successfully (placeholder only).`);
      // Future implementation: parse file → update products table
    }
  };

  return (
    <div className="upload-page">
      <header className="upload-header">
        <h2>📤 Upload Product File</h2>
        <p>
          Upload your product list (CSV or Excel). The system will read and
          update your market items automatically.
        </p>
      </header>

      {/* Upload Section */}
      <div className="upload-section">
        <label htmlFor="fileUpload" className="upload-label">
          <input
            id="fileUpload"
            type="file"
            accept=".csv, .xlsx"
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
          <span className="upload-btn">📁 Choose File to Upload</span>
        </label>
        <p className="note">
          Supported formats: <strong>.csv</strong>, <strong>.xlsx</strong>
        </p>
      </div>

      {/* Upload History */}
      <section className="upload-history">
        <h3>📜 Upload History</h3>
        <div className="history-table-container">
          <table className="history-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Date Uploaded</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {uploadHistory.map((record) => (
                <tr key={record.id}>
                  <td>{record.fileName}</td>
                  <td>
                    {new Date(record.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${record.status.toLowerCase()}`}
                    >
                      {record.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default UploadProducts;
