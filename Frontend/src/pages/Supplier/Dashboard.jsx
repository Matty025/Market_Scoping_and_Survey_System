import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import FileCardModal from "../../components/FileCardModal.jsx";
import "./Dashboard.css";

const SupplierDashboard = () => {
  const { token } = useAuth();
  const [assignedFiles, setAssignedFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleOpenModal = (file) => {
    setSelectedFile(file);
  };

  // Fetch assigned files from the backend
  useEffect(() => {
    const fetchAssignedFiles = async () => {
      try {
        const response = await axios.get("http://localhost:3001/api/supplier-files", {
          headers: { Authorization: `Bearer ${token}` },
        });
        // Deduplicate server results by FileID so the same procurement file
        // doesn't appear multiple times if the supplier was assigned the file more than once.
        const rows = response.data || [];
        const uniqueByFileId = Array.from(new Map(rows.map(r => [r.FileID, r])).values());
        if (uniqueByFileId.length !== rows.length) {
          console.warn(`Deduplicated assigned files: removed ${rows.length - uniqueByFileId.length} duplicates.`);
        }
        setAssignedFiles(uniqueByFileId);
      } catch (err) {
        setError("Failed to fetch assigned files. Please try again later.");
        console.error("Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchAssignedFiles();
    }
  }, [token]);

  const handleCloseModal = () => {
    setSelectedFile(null);
  };

  const handleSubmitResponse = async (file, uploadFile) => {
    // When you integrate with your database, this is where you'll send the data.
    const formData = new FormData();
    formData.append("supplierFileId", file.SupplierFileID); // From SupplierFiles table
    formData.append("responseFile", uploadFile); // The PDF file from the supplier

    console.log("Submitting response for:", file.Title);
    console.log("File to be uploaded:", uploadFile.name);

    try {
      // This endpoint should create a record in your "SupplierResponses" table
      const response = await axios.post("http://localhost:3001/api/supplier-responses", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });

      // Only update the UI after a successful response from the backend
      alert(`✅ Quotation submitted successfully for "${file.Title}"!`);
      handleCloseModal();
      // To see the status change, you could either refetch the list or update the state directly
      setAssignedFiles(assignedFiles.map(f => f.SupplierFileID === file.SupplierFileID ? {...f, Status: 'Answered'} : f));
    } catch (error) {
      console.error("Failed to submit quotation:", error);
      alert("❌ There was an error submitting your quotation. Please try again.");
    }
  };

  return (
    <div className="supplier-dashboard">
      <header className="supplier-header">
        <h2>📄 Assigned Procurement Files</h2>
        <p>Click a card to view details and respond.</p>
      </header>

      {isLoading && <p>Loading files...</p>}
      {error && <p className="error-message">{error}</p>}

      <div className="posts-container">
        {!isLoading && !error && assignedFiles.length === 0 && (
          <p>No procurement files have been assigned to you yet.</p>
        )}
        {assignedFiles.map((file) => (
          <div
            key={file.SupplierFileID}
            className="post-card"
            onClick={() => handleOpenModal(file)}
          >
            {/* 
              NOTE: Your backend should JOIN SupplierFiles with ProcurementFiles 
              to get Title, Description, etc.
              Example structure for 'file' object:
              { SupplierFileID: 1, Status: 'Pending', Title: 'Procurement of Laptops', ... }
            */}
            <h3 className="post-title">{file.Title}</h3>
            <p className="post-date">
              📅{" "}
              {new Date(file.dateSent).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="post-description">
              {file.Description.substring(0, 80)}...
            </p>
            <span className={`status-badge ${file.Status.toLowerCase()}`}>
              {file.Status}
            </span>
          </div>
        ))}
      </div>

      {selectedFile && (
        <FileCardModal
          file={selectedFile}
          onClose={handleCloseModal}
          onSubmit={handleSubmitResponse}
        />
      )}
    </div>
  );
};

export default SupplierDashboard;