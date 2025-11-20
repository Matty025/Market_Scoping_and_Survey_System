import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import "./UploadProducts.css";
import AddProductForm from "./AddProductForm";

const backendBase = "http://localhost:3001";

const UploadProducts = () => {
  const { token } = useAuth();
  const [uploadHistory, setUploadHistory] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });
  const [showAddModal, setShowAddModal] = useState(false);

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
    setSelectedFile(e.target.files[0]);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return setToast({ visible: true, message: 'Please choose a file', type: 'error' });
    if (!token) return setToast({ visible: true, message: 'Not authenticated', type: 'error' });

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await axios.post(`${backendBase}/api/supplier-files/uploads`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      setToast({ visible: true, message: 'File uploaded', type: 'success' });
      // Prepend new record to history
      setUploadHistory((prev) => [{ id: res.data.uploadId, fileName: selectedFile.name, date: res.data.createdAt || new Date().toISOString(), status: 'Pending' }, ...prev]);
      setSelectedFile(null);
    } catch (err) {
      console.error('Upload failed', err);
      setToast({ visible: true, message: `Upload failed: ${err.response?.data?.message || err.message}`, type: 'error' });
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
        <button className="upload-btn" onClick={() => setShowAddModal(true)} style={{ marginLeft: 8 }}>Add Product Manually</button>
        <p className="note">Supported formats: <strong>.csv</strong>, <strong>.xlsx</strong></p>
      </div>

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
              {uploadHistory.length > 0 ? uploadHistory.map((record) => (
                <tr key={record.id}>
                  <td>{record.fileName}</td>
                  <td>{new Date(record.date).toLocaleDateString()}</td>
                  <td><span className={`status-badge ${record.status.toLowerCase()}`}>{record.status}</span></td>
                </tr>
              )) : (
                <tr><td colSpan={3}>No uploads yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Toast visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, visible: false })} />
      {showAddModal && (
        <AddProductForm onClose={() => setShowAddModal(false)} onCreated={(id) => { fetchHistory(); }} />
      )}
    </div>
  );
};

export default UploadProducts;
