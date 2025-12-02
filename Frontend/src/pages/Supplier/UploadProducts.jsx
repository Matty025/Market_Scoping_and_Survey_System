import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import "./UploadProducts.css";

const backendBase = "http://localhost:3001";

const UploadProducts = () => {
  const { token } = useAuth();
  const [uploadHistory, setUploadHistory] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHistory = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${backendBase}/api/supplier-files/uploads/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUploadHistory(res.data || []);
    } catch (err) {
      console.error('Failed to fetch upload history', err);
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
    if (!selectedFile) return setToast({ visible: true, message: 'Please select a file to upload.', type: 'error' });
    if (!token) return setToast({ visible: true, message: 'Not authenticated', type: 'error' });

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await axios.post(`${backendBase}/api/supplier-files/uploads`, formData, {
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
    }
  };

  const handleDelete = async (uploadId) => {
    if (!window.confirm('Are you sure you want to delete this upload and all of its associated products? This action cannot be undone.')) {
      return;
    }

    try {
      await axios.delete(`${backendBase}/api/supplier-files/uploads/${uploadId}`, {
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
        <h2>📤 Upload Product File</h2>
        <p>
          Upload your product list (CSV or Excel). The system will read and
          update your market items automatically.
        </p>
      </header>

      <div className="upload-section">
        <input id="fileUpload" type="file" accept=".csv, .xlsx" onChange={handleFileChange} />
        <button className="upload-btn" onClick={handleSubmit}>Upload</button>
        <p className="note">
          Supported formats: <strong>.csv</strong>, <strong>.xlsx</strong>. For the optional
          <code>Effective Until</code> column, enter calendar dates in <strong>YYYY-MM-DD</strong>
          format (example: <code>2025-12-05</code>).
        </p>
      </div>

      <section className="upload-history">
        <h3>📜 Upload History</h3>
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
              {uploadHistory.length > 0 ? uploadHistory.map((record) => (
                <tr key={record.id}>
                  <td>{record.fileName}</td>
                  <td>{new Date(record.date).toLocaleString("en-US", {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}</td>
                  <td>{record.rowCount}</td>
                  <td><span className={`status-badge ${record.status.toLowerCase()}`}>{record.status}</span></td>
                  <td>
                    <button className="btn-delete" onClick={() => handleDelete(record.id)}>Delete</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5}>No uploads yet.</td></tr>
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
