import React, { useState, useEffect } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import "./UploadProducts.css";

const UploadProducts = () => {
  const { token } = useAuth();
  const [uploadHistory, setUploadHistory] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHistory = async () => {
    if (!token) return;
    setIsHistoryLoading(true);
    try {
      const res = await api.get(`/api/supplier-files/uploads/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUploadHistory(res.data || []);
    } catch (err) {
      console.error('Failed to fetch upload history', err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // --- Better Frontend Validation ---
    const allowedExtensions = ['.xlsx', '.csv'];
    const fileExtension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      setToast({ visible: true, message: 'Invalid file type. Please upload an .xlsx or .csv file.', type: 'error' });
      e.target.value = ''; // Clear the input
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleSubmit = async () => {
    if (isUploading) return; // Prevent spamming multiple uploads
    if (!selectedFile) return setToast({ visible: true, message: 'Please select a file to upload.', type: 'error' });
    if (!token) return setToast({ visible: true, message: 'Not authenticated', type: 'error' });

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setIsUploading(true);
      const res = await api.post(`/api/supplier-files/uploads`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      setToast({ visible: true, message: res.data.message || 'File processed successfully!', type: 'success' });
      setSelectedFile(null);
      document.getElementById('fileUpload').value = ''; // Clear the file input visually

      // ** THE FIX **
      // Instead of manually adding a 'Pending' record, just refetch the complete and accurate history from the server.
      fetchHistory();
    } catch (err) {
      console.error('Upload failed', err);
      setToast({ visible: true, message: `Upload failed: ${err.response?.data?.message || err.message}`, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (uploadId) => {
    if (!window.confirm('Are you sure you want to delete this upload and all of its associated products? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/api/supplier-files/uploads/${uploadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setToast({ visible: true, message: 'Upload deleted successfully.', type: 'success' });
      fetchHistory(); // Refresh the list
    } catch (err) {
      console.error('Delete failed', err);
      setToast({ visible: true, message: `Delete failed: ${err.response?.data?.message || err.message}`, type: 'error' });
    }
  };

  return (
    <div className="upload-page">
      <header className="upload-header">
        <h2>Upload Product File</h2>
        <p>
          Upload your product list (CSV or Excel). The system will read and
          update your market items automatically.
        </p>
      </header>

      <div className="upload-section">
        <div className="upload-controls">
          <input id="fileUpload" type="file" accept=".csv, .xlsx" onChange={handleFileChange} disabled={isUploading} />
          <button className="upload-btn" onClick={handleSubmit} disabled={isUploading}>
            {isUploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        <p className="note">
          Supported formats: <strong>.csv</strong>, <strong>.xlsx</strong>. For the optional
          <code>Effective Until</code> column, enter calendar dates in <strong>YYYY-MM-DD</strong>
          format (example: <code>2025-12-05</code>).
        </p>
      </div>

      {/* Upload Instructions Section */}
      <section className="upload-instructions-section">
        <div className="instructions-header">
          <h3>Upload Instructions</h3>
          <button 
            className="toggle-instructions-btn" 
            onClick={() => setInstructionsExpanded(!instructionsExpanded)}
          >
            {instructionsExpanded ? 'Hide Instructions' : 'Show Instructions'}
            <span className={`toggle-icon ${instructionsExpanded ? 'expanded' : ''}`}>
              ▼
            </span>
          </button>
        </div>
        <div className={`upload-instructions ${instructionsExpanded ? 'expanded' : ''}`}>
          <div className="instruction-section">
            <h4>Required File Columns</h4>
            <ul>
              <li><strong>Name</strong> - Product name (required)</li>
              <li><strong>Description</strong> - Detailed product description</li>
              <li><strong>Price</strong> - Unit price in Philippine Peso (₱)</li>
              <li><strong>Stock</strong> - Available quantity (numeric)</li>
              <li><strong>Unit</strong> - Unit of measurement (e.g., piece, kg, box)</li>
              <li><strong>Location</strong> - Storage or supplier location</li>
              <li><strong>Effective Until</strong> - (Optional) Expiration date in YYYY-MM-DD format</li>
            </ul>
          </div>

          <div className="instruction-section">
            <h4>File Format Guidelines</h4>
            <ul>
              <li>Supported file types: <strong>.xlsx</strong> (Excel) and <strong>.csv</strong></li>
              <li>First row must contain column headers (case-sensitive)</li>
              <li>Each row represents one product</li>
              <li>Empty rows will be skipped automatically</li>
              <li>Maximum file size: <strong>5MB</strong></li>
            </ul>
          </div>

          <div className="instruction-warning">
            <h4>Important Notes</h4>
            <ul>
              <li><strong>Price Format:</strong> Enter numbers only (e.g., 1250.50), no currency symbols</li>
              <li><strong>Stock:</strong> Must be a whole number (e.g., 100, not 100.5)</li>
              <li><strong>Date Format:</strong> Use YYYY-MM-DD only (e.g., 2025-12-31)</li>
              <li><strong>Duplicates:</strong> Products with the same name will be updated, not duplicated</li>
              <li><strong>Categories:</strong> Auto-matched based on product name and description</li>
            </ul>
          </div>

          <div className="instruction-example">
            <h4>Example File Structure</h4>
            <div className="table-scroll">
              <table className="example-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Unit</th>
                    <th>Effective Until</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Steel Bars</td>
                    <td>High-grade construction steel</td>
                    <td>1500</td>
                    <td>100</td>
                    <td>kg</td>
                    <td>2025-12-05</td>
                  </tr>
                  <tr>
                    <td>Office Chair</td>
                    <td>Ergonomic design with lumbar support</td>
                    <td>3500</td>
                    <td>50</td>
                    <td>pcs</td>
                    <td>2025-08-31</td>
                  </tr>
                  <tr>
                    <td>Cement Bags</td>
                    <td>Portland cement 50kg bags</td>
                    <td>250</td>
                    <td>500</td>
                    <td>bag</td>
                    <td>2026-03-15</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="instruction-categories-list">
              <h4>How Categories Work</h4>
              <p className="category-match-note">
                Categories are <strong>predefined in the system</strong> and/or provided in the Excel sheet template. You can simply copy and paste the correct category for each product from the list in your Excel sheet or from the system. No need to invent or guess categories—just use the provided options for consistency.
              </p>
          </div>
        </div>
      </section>

      <section className="upload-history">
        <h3>Upload History</h3>
        <div className="history-table-container">
          <table className="history-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Date Uploaded</th>
                <th>Rows</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isHistoryLoading ? (
                <tr>
                  <td colSpan={5} className="history-placeholder">
                    <div className="history-loading">
                      <div className="loading-spinner" aria-hidden />
                      <span>Loading uploads...</span>
                    </div>
                  </td>
                </tr>
              ) : uploadHistory.length > 0 ? (
                uploadHistory.map((record) => (
                  <tr key={record.id}>
                    <td data-label="File Name">{record.fileName}</td>
                    <td data-label="Date Uploaded">{new Date(record.date).toLocaleString("en-US", {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}</td>
                    <td data-label="Rows">{record.rowCount}</td>
                    <td data-label="Status"><span className={`status-badge ${record.status.toLowerCase()}`}>{record.status}</span></td>
                    <td className="history-actions" data-label="Actions">
                      <button className="btn-delete" onClick={() => handleDelete(record.id)}>Delete</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="history-placeholder">No uploads yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Toast visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, visible: false })} />
    </div>
  );
};

export default UploadProducts;
