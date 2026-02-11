import React, { useState, useEffect } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import legacyTemplateUrl from "../../assets/supplier-legacy-template.xlsx?url";
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

  const handleDownloadTemplate = async () => {
    if (!token) return setToast({ visible: true, message: 'Not authenticated', type: 'error' });
    try {
      // First ask backend for the current template link (avoids CORS issues when redirecting to Google Sheets)
      const meta = await api.get(`/api/supplier-files/uploads/template?format=json`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const url = meta.data?.templateUrl;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        setToast({ visible: true, message: 'Opening template link...', type: 'success' });
        return;
      }

      // Fallback to downloading the bundled XLSX from the server
      const res = await api.get(`/api/supplier-files/uploads/template`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'supplier-product-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      setToast({ visible: true, message: 'Template downloaded.', type: 'success' });
    } catch (err) {
      console.error('Template download failed', err);
      setToast({ visible: true, message: `Template download failed: ${err.response?.data?.message || err.message}`, type: 'error' });
    }
  };

  const handleDownloadExcelTemplate = () => {
    try {
      const link = document.createElement('a');
      link.href = legacyTemplateUrl;
      link.download = 'supplier-product-template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setToast({ visible: true, message: 'Excel template download started.', type: 'success' });
    } catch (err) {
      console.error('Excel template download failed', err);
      setToast({ visible: true, message: 'Unable to download the Excel template. Please try again.', type: 'error' });
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
        <div className="template-download">
          <div className="template-button-row">
            <button className="template-btn" onClick={handleDownloadTemplate} disabled={isUploading}>
              Download Google Sheets Copy
            </button>
            <button className="template-btn secondary" onClick={handleDownloadExcelTemplate} disabled={isUploading}>
              Download Excel Template
            </button>
          </div>
          <span className="template-note">Includes required columns and a Categories tab. Legacy file matches the older format.</span>
          <p className="contact-banner">
            For inquiries, email <span className="contact-chip">sdomarketscoping@gmail.com</span> or call <span className="contact-chip">09258814880</span>.
          </p>
        </div>
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
              <li><strong>Price</strong> - Unit price in Philippine Peso (numbers only)</li>
              <li><strong>Unit</strong> - Unit of measurement (e.g., piece, kg, box)</li>
              <li><strong>Stock</strong> - Available quantity (numeric)</li>
              <li><strong>Location</strong> - Storage or supplier location</li>
              <li><strong>Categories</strong> - Pick from the provided dropdown list in the template (do not free-type)</li>
              <li><strong>Effective Until</strong> - Optional expiration date in YYYY-MM-DD format</li>
            </ul>
          </div>

          <div className="instruction-section">
            <h4>Template & File Guidelines</h4>
            <ul>
              <li>Click <strong>Download Excel Template</strong> to open the Google Sheets sample, then <strong>File → Make a copy</strong> to edit your own copy.</li>
              <li>After editing, download as <strong>Microsoft Excel (.xlsx)</strong> and upload here.</li>
              <li>Supported file types: <strong>.xlsx</strong> (Excel) and <strong>.csv</strong>; max size <strong>5MB</strong>.</li>
              <li>First row must contain the headers from the template; each row is one product.</li>
              <li>Empty rows are skipped automatically.</li>
            </ul>
          </div>

          <div className="instruction-warning">
            <h4>Important Notes</h4>
            <ul>
              <li><strong>Price Format:</strong> Enter numbers only (e.g., 27000), no currency symbols</li>
              <li><strong>Stock:</strong> Must be a whole number (e.g., 100, not 100.5)</li>
              <li><strong>Date Format:</strong> Use YYYY-MM-DD only (e.g., 2025-12-31)</li>
              <li><strong>Duplicates:</strong> Products with the same name will be updated, not duplicated</li>
              <li><strong>Categories:</strong> Use the dropdown list provided in the template; do not type free text</li>
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
                    <th>Unit</th>
                    <th>Stock</th>
                    <th>Location</th>
                    <th>Categories</th>
                    <th>Effective Until</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>A4 Bond Paper 80gsm</td>
                    <td>500 sheets per ream</td>
                    <td>210</td>
                    <td>ream</td>
                    <td>250</td>
                    <td>Bulacan Central Warehouse</td>
                    <td>Office Supplies & Devices; Printing & Reproduction Services</td>
                    <td>2026-03-31</td>
                  </tr>
                  <tr>
                    <td>Laser Printer Toner (HP 106A)</td>
                    <td>Original black cartridge compatible with HP M107/M135</td>
                    <td>1850</td>
                    <td>cartridge</td>
                    <td>40</td>
                    <td>Malolos</td>
                    <td>IT Equipment & Peripherals; Office Supplies & Devices; Electrical & Electronic Supplies</td>
                    <td>2026-04-30</td>
                  </tr>
                  <tr>
                    <td>Disposable Nitrile Gloves</td>
                    <td>Blue, powder-free, 100 pcs/box</td>
                    <td>450</td>
                    <td>box (100 pcs)</td>
                    <td>120</td>
                    <td>Calumpit</td>
                    <td>Medical & First Aid Supplies; Cleaning & Janitorial Supplies</td>
                    <td>2026-02-28</td>
                  </tr>
                  <tr>
                    <td>Catering Package – 50 pax</td>
                    <td>Buffet lunch: 3 mains, 2 sides, rice, drinks, utensils, on-site servers</td>
                    <td>27500</td>
                    <td>package</td>
                    <td>4</td>
                    <td>Guiguinto</td>
                    <td>Food & Catering Supplies; General Support Services</td>
                    <td>2026-05-31</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="instruction-categories-list">
              <h4>How Categories Work</h4>
              <p className="category-match-note">
                Categories are <strong>predefined</strong> and included as dropdown lists in the template. Select from the provided options (do not type new ones) so your uploads match system categories. If you copy the template, the dropdowns stay intact.
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
