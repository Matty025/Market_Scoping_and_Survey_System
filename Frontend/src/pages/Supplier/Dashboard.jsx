import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import FileCardModal from "../../components/FileCardModal.jsx";
import Toast from "../../components/Toast";
import "./Dashboard.css";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const SupplierDashboard = () => {
  const { token } = useAuth();
  const [assignedFiles, setAssignedFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOption, setSortOption] = useState("deadline");
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });
  const [lastUpdated, setLastUpdated] = useState(null);

  const handleOpenModal = (file) => {
    setSelectedFile(file);
  };

  const handleCardClick = (file) => {
    if (file.isFailedPosting) {
      setToast({
        visible: true,
        type: "info",
        message: "This posting has closed. Please await new assignments.",
      });
      return;
    }

    handleOpenModal(file);
  };

  // Fetch assigned files from the backend
  useEffect(() => {
    const fetchAssignedFiles = async () => {
      try {
        const response = await axios.get("http://localhost:3001/api/supplier-files", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rows = response.data || [];
        const uniqueBySupplierFileId = Array.from(new Map(rows.map((r) => [r.SupplierFileID, r])).values());
        setAssignedFiles(uniqueBySupplierFileId);
        setLastUpdated(new Date());
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
    if (!token) return false;
    if (!uploadFile) {
      setToast({ visible: true, type: "warning", message: "Please attach your quotation PDF before submitting." });
      return false;
    }

    setIsSubmittingResponse(true);
    const formData = new FormData();
    formData.append("supplierFileId", file.SupplierFileID); // From SupplierFiles table
    formData.append("responseFile", uploadFile); // The PDF file from the supplier

    try {
      await axios.post("http://localhost:3001/api/supplier-responses", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });

      setToast({ visible: true, type: "success", message: `Quotation submitted for "${file.Title}".` });
      setAssignedFiles((prev) =>
        prev.map((f) =>
          f.SupplierFileID === file.SupplierFileID
            ? { ...f, Status: "Answered" }
            : f
        )
      );
      handleCloseModal();
      setLastUpdated(new Date());
      return true;
    } catch (error) {
      console.error("Failed to submit quotation:", error);
      const message = error.response?.data?.message || "There was an error submitting your quotation. Please try again.";
      setToast({ visible: true, type: "error", message });
      return false;
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  const processedFiles = useMemo(() => {
    const now = new Date();
    return assignedFiles.map((file) => {
      const endDateValue = file.endDate || file.EndDate || null;
      const endDateObj = endDateValue ? new Date(endDateValue) : null;
      const dateSentObj = file.dateSent ? new Date(file.dateSent) : null;
      const postedDateObj = file.datePosted ? new Date(file.datePosted) : null;
      const status = (file.Status || "Pending").toLowerCase();
      let dueState = "no-deadline";
      let dueLabel = "No deadline";
      let deadlineSortValue = Number.POSITIVE_INFINITY;
      let failedPostingDetail = "";
      const descriptionText = typeof file.Description === "string" ? file.Description : "";

      const isExpiredFlag = Boolean(file.isExpired || file.isexpired);

      if (endDateObj instanceof Date && !Number.isNaN(endDateObj.getTime())) {
        const diffMs = endDateObj.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / MS_IN_DAY);
        deadlineSortValue = diffMs;

        if (diffMs < 0) {
          dueState = "overdue";
          failedPostingDetail = `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"}`;
          dueLabel = "Deadline passed";
          deadlineSortValue = diffMs; // negative values bubble overdue to top when sorting
        } else if (diffDays === 0) {
          dueState = "due-today";
          dueLabel = "Due today";
        } else if (diffDays <= 3) {
          dueState = "due-soon";
          dueLabel = diffDays === 1 ? "Due in 1 day" : `Due in ${diffDays} days`;
        } else {
          dueState = "upcoming";
          dueLabel = `Due in ${diffDays} days`;
        }
      }

      const endDatePassed = Boolean(endDateObj && endDateObj.getTime() < now.getTime());
      const isFailedPosting = status !== "answered" && (isExpiredFlag || endDatePassed);
      if (isFailedPosting) {
        dueLabel = "Failed Posting";
      }

      const statusDisplay = status === "answered" ? "Answered" : (isFailedPosting ? "Failed Posting" : "Pending");
      const statusClass = status === "answered" ? "answered" : (isFailedPosting ? "failed" : "pending");
      const canSubmit = !isFailedPosting && status !== "answered";

      const categoryList = (file.categories || "")
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      return {
        ...file,
        endDateObj,
        dateSentObj,
        postedDateObj,
        descriptionText,
        normalizedStatus: status,
        dueState,
        dueLabel,
        deadlineSortValue,
        categoryList,
        expired: isExpiredFlag || endDatePassed,
        isFailedPosting,
        statusDisplay,
        statusClass,
        canSubmit,
        failedPostingDetail: failedPostingDetail || null,
        searchIndex: `${file.Title || ""} ${descriptionText} ${(file.categories || "")}`.toLowerCase(),
      };
    });
  }, [assignedFiles]);

  const statsSummary = useMemo(() => {
    const total = processedFiles.length;
    const answered = processedFiles.filter((file) => file.normalizedStatus === "answered").length;
    const failedPosting = processedFiles.filter((file) => file.isFailedPosting).length;
    const pending = processedFiles.filter((file) => file.normalizedStatus !== "answered" && !file.isFailedPosting).length;
    return { total, answered, pending, failedPosting };
  }, [processedFiles]);

  const filteredFiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return processedFiles
      .filter((file) => {
        if (query && !file.searchIndex.includes(query)) {
          return false;
        }

        if (statusFilter === "Pending") {
          return file.normalizedStatus !== "answered" && !file.isFailedPosting;
        }
        if (statusFilter === "Answered") {
          return file.normalizedStatus === "answered";
        }
        if (statusFilter === "FailedPosting") {
          return file.isFailedPosting;
        }
        if (statusFilter === "DueSoon") {
          return file.dueState === "due-soon" || file.dueState === "due-today";
        }
        return true;
      })
      .sort((a, b) => {
        if (sortOption === "deadline") {
          const aPriority = a.dueState === "overdue" ? -Number.MAX_SAFE_INTEGER : a.deadlineSortValue;
          const bPriority = b.dueState === "overdue" ? -Number.MAX_SAFE_INTEGER : b.deadlineSortValue;
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }

          if (a.endDateObj && b.endDateObj) {
            return a.endDateObj - b.endDateObj;
          }
          if (a.endDateObj) return -1;
          if (b.endDateObj) return 1;
        }

        if (sortOption === "recent") {
          const aTime = a.dateSentObj ? a.dateSentObj.getTime() : 0;
          const bTime = b.dateSentObj ? b.dateSentObj.getTime() : 0;
          return bTime - aTime;
        }

        if (sortOption === "status") {
          const rank = (item) => {
            if (item.normalizedStatus === "answered") return 0;
            if (item.isFailedPosting) return 2;
            return 1;
          };
          const diff = rank(a) - rank(b);
          if (diff !== 0) return diff;
          return (a.statusDisplay || "").localeCompare(b.statusDisplay || "");
        }

        return 0;
      });
  }, [processedFiles, searchTerm, statusFilter, sortOption]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("All");
    setSortOption("deadline");
  };

  const handleRequireFile = () => {
    setToast({ visible: true, type: "warning", message: "Please attach your quotation PDF before submitting." });
  };

  return (
    <div className="supplier-dashboard">
      <Toast
        type={toast.type}
        message={toast.message}
        visible={toast.visible}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
        duration={3200}
      />
      <header className="supplier-header">
        <h2>📄 Assigned Procurement Files</h2>
        <p>Click a card to review the details and upload your quotation.</p>
        <div className="supplier-header-meta">
          <span>{`Assignments: ${statsSummary.total}`}</span>
          <span>{`Pending: ${statsSummary.pending}`}</span>
          <span>{`Answered: ${statsSummary.answered}`}</span>
          <span>{`Failed Posting: ${statsSummary.failedPosting}`}</span>
          {lastUpdated && <span>{`Last updated: ${lastUpdated.toLocaleString()}`}</span>}
        </div>
      </header>

      {isLoading && <p>Loading files...</p>}
      {error && <p className="error-message">{error}</p>}

      <div className="supplier-filters">
        <input
          type="text"
          placeholder="Search title, description, or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="All">All statuses</option>
          <option value="Pending">Pending</option>
          <option value="FailedPosting">Failed Posting</option>
          <option value="DueSoon">Due soon</option>
          <option value="Answered">Answered</option>
        </select>
        <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
          <option value="deadline">Sort by deadline</option>
          <option value="recent">Most recently assigned</option>
          <option value="status">Sort by status</option>
        </select>
        {(searchTerm || statusFilter !== "All" || sortOption !== "deadline") && (
          <button type="button" className="clear-filters-btn" onClick={handleClearFilters}>
            Clear
          </button>
        )}
      </div>

      <div className="posts-container">
        {!isLoading && !error && filteredFiles.length === 0 && (
          <p>
            {assignedFiles.length === 0
              ? "No procurement files have been assigned to you yet."
              : "No assignments match your current filters."}
          </p>
        )}
        {filteredFiles.map((file) => (
          <div
            key={file.SupplierFileID}
            className={`post-card ${file.dueState} ${file.normalizedStatus} ${file.isFailedPosting ? "failed-posting" : ""}`.trim()}
            onClick={() => handleCardClick(file)}
          >
            {/* 
              NOTE: Your backend should JOIN SupplierFiles with ProcurementFiles 
              to get Title, Description, etc.
              Example structure for 'file' object:
              { SupplierFileID: 1, Status: 'Pending', Title: 'Procurement of Laptops', ... }
            */}
            <div className="post-card-header">
              <h3 className="post-title">{file.Title}</h3>
              <span className={`status-badge ${file.statusClass}`}>
                {file.statusDisplay}
              </span>
            </div>
            <div className={`due-chip ${file.dueState} ${file.isFailedPosting ? "failed-posting" : ""}`}>
              {file.dueLabel}
            </div>
            {file.failedPostingDetail && (
              <p className="post-date failed-posting-detail">{file.failedPostingDetail}</p>
            )}
            <p className="post-date">
              Posted {file.postedDateObj ? file.postedDateObj.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
            </p>
            {file.dateSentObj && (
              <p className="post-date">Assigned {file.dateSentObj.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
            )}
            {file.endDateObj && (
              <p className="post-date">Deadline {file.endDateObj.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
            )}
            <p className="post-description">
              {file.descriptionText.length > 120 ? `${file.descriptionText.substring(0, 117)}...` : (file.descriptionText || "No description provided.")}
            </p>
            {file.categoryList.length > 0 && (
              <div className="post-categories">
                {file.categoryList.slice(0, 3).map((cat, index) => (
                  <span key={index} className="category-pill">
                    {cat}
                  </span>
                ))}
                {file.categoryList.length > 3 && (
                  <span className="category-pill more">+{file.categoryList.length - 3} more</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedFile && (
        <FileCardModal
          file={selectedFile}
          onClose={handleCloseModal}
          onSubmit={handleSubmitResponse}
          onRequireFile={handleRequireFile}
          isSubmitting={isSubmittingResponse}
        />
      )}
    </div>
  );
};

export default SupplierDashboard;