import React, { useState, useEffect, useMemo, useCallback } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import FileCardModal from "../../components/FileCardModal.jsx";
import Toast from "../../components/Toast";
import StatusHistoryModal from "../../components/StatusHistoryModal";
import "./Dashboard.css";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const HISTORY_MODAL_INITIAL = {
  visible: false,
  loading: false,
  records: [],
  error: null,
  announcement: null,
};

const formatStatusLabel = (status) => {
  if (!status) return "";
  const normalized = String(status).toLowerCase().replace(/_/g, " ");
  return normalized.replace(/(^|\s)\w/g, (c) => c.toUpperCase());
};

const formatOrdinal = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }

  const abs = Math.abs(number);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${number}th`;
  }

  switch (abs % 10) {
    case 1:
      return `${number}st`;
    case 2:
      return `${number}nd`;
    case 3:
      return `${number}rd`;
    default:
      return `${number}th`;
  }
};

const SupplierDashboard = () => {
  const { token } = useAuth();
  const [assignedFiles, setAssignedFiles] = useState([]);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOption, setSortOption] = useState("deadline");
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [decisionState, setDecisionState] = useState({ loading: false, action: null });
  const [historyModal, setHistoryModal] = useState(HISTORY_MODAL_INITIAL);

  const fetchAssignedFiles = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      return [];
    }

    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await axios.get("http://localhost:3001/api/supplier-files", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const rows = response.data || [];
      const uniqueBySupplierFileId = Array.from(new Map(rows.map((r) => [r.SupplierFileID, r])).values());
      setAssignedFiles(uniqueBySupplierFileId);
      setLastUpdated(new Date());
      setError(null);
      return uniqueBySupplierFileId;
    } catch (err) {
      console.error("Fetch error:", err);
      if (!silent) {
        setError("Failed to fetch assigned files. Please try again later.");
      }
      return [];
    } finally {
      if (!silent) {
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [token]);

  const handleOpenModal = (file) => {
    setSelectedFileId(file.SupplierFileID);
    setDecisionState({ loading: false, action: null });
    setHistoryModal(HISTORY_MODAL_INITIAL);
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
    if (token) {
      fetchAssignedFiles({ silent: false });
    }
  }, [token, fetchAssignedFiles]);

  const handleCloseModal = () => {
    setSelectedFileId(null);
    setDecisionState({ loading: false, action: null });
    setHistoryModal(HISTORY_MODAL_INITIAL);
  };

  const closeHistoryModal = () => {
    setHistoryModal(HISTORY_MODAL_INITIAL);
  };

  const handleViewTimeline = useCallback(
    async (file) => {
      if (!token || !file?.SupplierFileID) {
        return;
      }

      const announcementInfo = {
        id: file.FileID ?? file.fileId ?? null,
        title: file.Title || "Procurement File",
      };

      setHistoryModal({
        visible: true,
        loading: true,
        records: [],
        error: null,
        announcement: announcementInfo,
      });

      try {
        const response = await axios.get(
          `http://localhost:3001/api/supplier-files/${file.SupplierFileID}/status-history`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const records = Array.isArray(response.data) ? response.data : [];
        setHistoryModal((prev) => ({ ...prev, loading: false, records }));
      } catch (err) {
        console.error("Failed to load status history:", err);
        const message = err.response?.data?.message || "Failed to load status history. Please try again.";
        setHistoryModal((prev) => ({ ...prev, loading: false, error: message }));
      }
    },
    [token]
  );

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
      await fetchAssignedFiles({ silent: true });
      handleCloseModal();
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

  const handleOptInDecision = async (file) => {
    if (!token) return;
    if (decisionState.loading) return;
    setDecisionState({ loading: true, action: "opt-in" });

    try {
      const response = await axios.post(
        `http://localhost:3001/api/supplier-files/${file.SupplierFileID}/opt-in`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const message = response.data?.message || "Participation confirmed.";
      setToast({ visible: true, type: "success", message });

      await fetchAssignedFiles({ silent: true });
    } catch (error) {
      console.error("Opt-in decision failed:", error);
      const message = error.response?.data?.message || "We couldn't update your decision. Please try again.";
      setToast({ visible: true, type: "error", message });
    } finally {
      setDecisionState({ loading: false, action: null });
    }
  };

  const handleDeclineDecision = async (file) => {
    if (!token) return;
    if (decisionState.loading) return;
    setDecisionState({ loading: true, action: "decline" });

    try {
      const response = await axios.post(
        `http://localhost:3001/api/supplier-files/${file.SupplierFileID}/decline`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const message = response.data?.message || "You have declined this attempt.";
      setToast({ visible: true, type: "info", message });

      await fetchAssignedFiles({ silent: true });
    } catch (error) {
      console.error("Decline decision failed:", error);
      const message = error.response?.data?.message || "We couldn't record your decision. Please try again.";
      setToast({ visible: true, type: "error", message });
    } finally {
      setDecisionState({ loading: false, action: null });
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
      const attemptCountRaw = Number(file.attemptCount ?? file.AttemptCount ?? 0);
      const currentAttemptRaw = Number(file.currentAttemptNumber ?? file.CurrentAttemptNumber ?? attemptCountRaw);
      const attemptCount = Number.isFinite(currentAttemptRaw) && currentAttemptRaw > 0
        ? currentAttemptRaw
        : (attemptCountRaw > 0 ? attemptCountRaw : 1);
      const latestStatusRaw = file.latestStatus || file.lateststatus || null;
      const latestStatusLabel = formatStatusLabel(latestStatusRaw);
      const latestStatusKey = latestStatusRaw ? String(latestStatusRaw).toLowerCase() : null;
      const latestStatusAt = file.latestChangedAt ? new Date(file.latestChangedAt) : null;
      let latestStatusNote = typeof file.latestNote === "string" ? file.latestNote.trim() : "";
      if (latestStatusNote.toLowerCase() === "initial posting") {
        latestStatusNote = "";
      }
      const showLatestUpdate = Boolean(latestStatusNote) || (latestStatusKey && !["active", "pending"].includes(latestStatusKey));
      const optInStatusRaw = file.optInStatus ?? file.OptInStatus ?? "PENDING";
      const optInStatus = String(optInStatusRaw).toUpperCase();
      const optedInAt = file.optedInAt ? new Date(file.optedInAt) : null;
      const declinedAt = file.declinedAt ? new Date(file.declinedAt) : null;
      const lastResponseId = file.lastResponseId ?? file.LastResponseId ?? null;
      const lastResponsePath = file.lastResponseFilePath ?? file.LastResponseFilePath ?? "";
      const lastResponseUploadedAt = file.lastResponseDate ? new Date(file.lastResponseDate) : null;
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

      const isMultiAttempt = attemptCount > 1;
      const requiresDecision = isMultiAttempt && optInStatus === "PENDING";
      const isDeclined = isMultiAttempt && optInStatus === "DECLINED";
      const hasDecisionActions = isMultiAttempt && (optInStatus === "PENDING" || optInStatus === "DECLINED");

      let statusDisplay;
      let statusClass;
      if (status === "answered") {
        statusDisplay = optInStatus === "SUBMITTED" ? "Submitted" : "Answered";
        statusClass = "answered";
      } else if (isFailedPosting) {
        statusDisplay = "Failed Posting";
        statusClass = "failed";
      } else if (isDeclined) {
        statusDisplay = "Declined";
        statusClass = "declined";
      } else if (requiresDecision) {
        statusDisplay = "Awaiting Decision";
        statusClass = "pending";
      } else if (optInStatus === "OPTED_IN") {
        statusDisplay = "Awaiting Submission";
        statusClass = "pending";
      } else {
        statusDisplay = "Pending";
        statusClass = "pending";
      }

      const canSubmit = !isFailedPosting && status !== "answered" && !requiresDecision && !isDeclined;

      const categoryList = (file.categories || "")
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);

      let decisionBanner = "";
      let decisionBannerClass = "";
      if (requiresDecision) {
        decisionBanner = "Action needed: confirm participation for this attempt.";
        decisionBannerClass = "pending";
      } else if (isDeclined) {
        decisionBanner = "You declined this attempt. Open the card if you would like to rejoin.";
        decisionBannerClass = "declined";
      } else if (optInStatus === "OPTED_IN") {
        const optedInLabel = optedInAt ? ` on ${optedInAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : "";
        decisionBanner = `You opted in${optedInLabel}. Please upload your quotation to complete this round.`;
        decisionBannerClass = "opted-in";
      } else if (optInStatus === "SUBMITTED") {
        decisionBanner = "Quotation submitted.";
        decisionBannerClass = "submitted";
      }

      return {
        ...file,
        endDateObj,
        dateSentObj,
        postedDateObj,
        attemptCount,
        attemptLabel: attemptCount > 1 ? `${formatOrdinal(attemptCount)} attempt` : "Initial attempt",
        latestStatusLabel,
        latestStatusKey,
        latestStatusAt,
        latestStatusNote,
        showLatestUpdate,
        descriptionText,
        normalizedStatus: status,
        currentAttemptNumber: attemptCount,
        optInStatus,
        optedInAt,
        declinedAt,
        lastResponse: lastResponseId
          ? {
              id: lastResponseId,
              filePath: lastResponsePath,
              uploadedAt: lastResponseUploadedAt,
            }
          : null,
        requiresDecision,
        hasDecisionActions,
        isDeclined,
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
        decisionBanner,
        decisionBannerClass,
        searchIndex: `${file.Title || ""} ${descriptionText} ${(file.categories || "")}`.toLowerCase(),
      };
    });
  }, [assignedFiles]);

  const selectedFile = useMemo(
    () => processedFiles.find((file) => file.SupplierFileID === selectedFileId) || null,
    [processedFiles, selectedFileId]
  );

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
        {filteredFiles.map((file) => {
          const cardClassName = [
            "post-card",
            file.dueState,
            file.normalizedStatus,
            file.isFailedPosting ? "failed-posting" : "",
            file.isDeclined ? "declined" : "",
            file.requiresDecision ? "awaiting-decision" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={file.SupplierFileID}
              className={cardClassName}
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
            {file.attemptCount > 1 && (
              <p className="post-attempt">Attempt: {file.attemptLabel}</p>
            )}
            {file.decisionBanner && (
              <p className={`post-decision ${file.decisionBannerClass || ""}`.trim()}>
                {file.decisionBanner}
              </p>
            )}
            {file.showLatestUpdate && (
              <div
                className={`post-note ${(file.latestStatusKey || file.normalizedStatus || "")
                  .replace(/[_\s]+/g, "-")
                  .replace(/-+$/, "")}`.trim()}
                onClick={(event) => event.stopPropagation()}
              >
                <span className="post-note-label">
                  Latest update{file.latestStatusLabel ? ` • ${file.latestStatusLabel}` : ""}
                </span>
                {file.latestStatusNote && (
                  <p className="post-note-text">{file.latestStatusNote}</p>
                )}
                {file.latestStatusAt && (
                  <span className="post-note-date">
                    {`Updated ${file.latestStatusAt.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`}
                  </span>
                )}
              </div>
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
          );
        })}
      </div>

      {selectedFile && (
        <FileCardModal
          file={selectedFile}
          onClose={handleCloseModal}
          onSubmit={handleSubmitResponse}
          onRequireFile={handleRequireFile}
          isSubmitting={isSubmittingResponse}
          canSubmit={selectedFile.canSubmit}
          onOptIn={(file) => handleOptInDecision(file)}
          onDecline={handleDeclineDecision}
          onViewHistory={handleViewTimeline}
          isDecisionPending={decisionState.loading}
          decisionAction={decisionState.action}
        />
      )}

      <StatusHistoryModal
        visible={historyModal.visible}
        onClose={closeHistoryModal}
        records={historyModal.records}
        announcement={historyModal.announcement}
        loading={historyModal.loading}
        error={historyModal.error}
      />
    </div>
  );
};

export default SupplierDashboard;