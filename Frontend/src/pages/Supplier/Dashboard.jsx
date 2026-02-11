import React, { useState, useEffect, useMemo, useCallback } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import FileCardModal from "../../components/FileCardModal.jsx";
import Toast from "../../components/Toast";
import StatusHistoryModal from "../../components/StatusHistoryModal";
import Pagination from "../../components/Pagination";
import "./Dashboard.css";

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 10;

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
  const [expandedFileId, setExpandedFileId] = useState(null);
  const [viewedFileIds, setViewedFileIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [reuseState, setReuseState] = useState({ loading: false, supplierFileId: null });

  const fetchAssignedFiles = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      return [];
    }

    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const response = await api.get("/api/supplier-files", {
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

  const markFileAsViewed = useCallback((supplierFileId) => {
    if (!supplierFileId) {
      return;
    }
    setViewedFileIds((prev) => {
      if (prev.includes(supplierFileId)) {
        return prev;
      }
      return [...prev, supplierFileId];
    });
    // TODO: Integrate with backend "viewed" tracking endpoint when available.
  }, []);

  const handleOpenModal = (file) => {
    markFileAsViewed(file.SupplierFileID);
    setSelectedFileId(file.SupplierFileID);
    setDecisionState({ loading: false, action: null });
    setHistoryModal(HISTORY_MODAL_INITIAL);
  };

  const handleToggleExpand = (file) => {
    if (!file) {
      return;
    }
    setExpandedFileId((prev) => {
      if (prev === file.SupplierFileID) {
        return null;
      }
      markFileAsViewed(file.SupplierFileID);
      return file.SupplierFileID;
    });
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

      markFileAsViewed(file.SupplierFileID);

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
        const response = await api.get(
          `/api/supplier-files/${file.SupplierFileID}/status-history`,
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
    [token, markFileAsViewed]
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
      await api.post("/api/supplier-responses", formData, {
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

  const handleReuseResponse = async (file, sourceResponseId) => {
    if (!token || !file?.SupplierFileID) return false;
    if (reuseState.loading) return false;

    setReuseState({ loading: true, supplierFileId: file.SupplierFileID });
    try {
      await api.post(
        "/api/supplier-responses/reuse",
        { supplierFileId: file.SupplierFileID, sourceResponseId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setToast({ visible: true, type: "success", message: `Reused your last submission for "${file.Title}".` });
      await fetchAssignedFiles({ silent: true });
      handleCloseModal();
      return true;
    } catch (error) {
      console.error("Failed to reuse quotation:", error);
      const message = error.response?.data?.message || "Unable to reuse your previous submission.";
      setToast({ visible: true, type: "error", message });
      return false;
    } finally {
      setReuseState({ loading: false, supplierFileId: null });
    }
  };

  const handleOptInDecision = async (file) => {
    if (!token) return;
    if (decisionState.loading) return;
    setDecisionState({ loading: true, action: "opt-in" });

    try {
      const response = await api.post(
        `/api/supplier-files/${file.SupplierFileID}/opt-in`,
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
      const response = await api.post(
        `/api/supplier-files/${file.SupplierFileID}/decline`,
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
    const viewedSet = new Set(viewedFileIds);
    return assignedFiles.map((file) => {
      const endDateValue = file.endDate || file.EndDate || null;
      const endDateObj = endDateValue ? new Date(endDateValue) : null;
      const dateSentObj = file.dateSent ? new Date(file.dateSent) : null;
      const postedDateObj = file.datePosted ? new Date(file.datePosted) : null;

      const supplierStatus = (file.Status || "pending").toLowerCase();
      const procurementStatus = (file.procurementStatus || file.ProcurementStatus || file.procurementstatus || supplierStatus || "pending").toLowerCase();

      const toBadgeClass = (value, fallback = "pending") => {
        const key = String(value || "").toLowerCase().replace(/\s+/g, "_");
        if (["completed"].includes(key)) return "completed";
        if (["failed_posting", "failed-posting"].includes(key)) return "failed-posting";
        if (["cancelled", "closed", "expired"].includes(key)) return "closed";
        if (["answered", "submitted"].includes(key)) return "answered";
        if (["active", "pending"].includes(key)) return "pending";
        return fallback;
      };

      // Prefer admin-set procurement status when final; otherwise use supplier file status for submission context
      let status = supplierStatus;
      if (["completed", "failed_posting", "cancelled", "closed", "expired"].includes(procurementStatus)) {
        status = procurementStatus;
      } else if (procurementStatus === "active" || procurementStatus === "pending") {
        status = supplierStatus || procurementStatus;
      } else {
        status = procurementStatus || supplierStatus;
      }

      const isClosedStatus = ["closed", "cancelled", "expired", "completed", "failed_posting"].includes(procurementStatus);
      const isFinalized = isClosedStatus;
      const hasViewedFromBackend = Boolean(
        file.hasViewed ||
        file.viewed ||
        file.viewedAt ||
        file.ViewedAt ||
        file.lastViewedAt ||
        file.LastViewedAt
      );
      const hasViewed = hasViewedFromBackend || viewedSet.has(file.SupplierFileID);
      const attemptCountRaw = Number(file.attemptCount ?? file.AttemptCount ?? 0);
      const currentAttemptRaw = Number(file.currentAttemptNumber ?? file.CurrentAttemptNumber ?? attemptCountRaw);
      const attemptCount = Number.isFinite(currentAttemptRaw) && currentAttemptRaw > 0
        ? currentAttemptRaw
        : (attemptCountRaw > 0 ? attemptCountRaw : 1);
      const latestStatusRaw = file.latestStatus || file.lateststatus || procurementStatus || null;
      const latestStatusLabel = formatStatusLabel(latestStatusRaw);
      const latestStatusKey = latestStatusRaw ? String(latestStatusRaw).toLowerCase() : null;
      const latestStatusAt = file.latestChangedAt ? new Date(file.latestChangedAt) : null;
      let latestStatusNote = typeof file.latestNote === "string" ? file.latestNote.trim() : "";
      if (latestStatusNote.toLowerCase() === "initial posting") {
        latestStatusNote = "";
      }
      let showLatestUpdate = Boolean(latestStatusNote) || (latestStatusKey && !["active", "pending"].includes(latestStatusKey));
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
      const isFailedPosting = procurementStatus === "failed_posting" || status === "failed_posting" || (!isFinalized && status !== "answered" && (isExpiredFlag || endDatePassed));
      if (isFailedPosting) {
        dueLabel = "Failed Posting";
      }

      if (isFinalized) {
        dueState = status || "finalized";
        dueLabel = formatStatusLabel(status);
        deadlineSortValue = Number.POSITIVE_INFINITY;
        failedPostingDetail = "";
      }

      const isMultiAttempt = attemptCount > 1;
      const requiresDecision = !isFinalized && isMultiAttempt && optInStatus === "PENDING";
      const isDeclined = !isFinalized && isMultiAttempt && optInStatus === "DECLINED";
      const hasDecisionActions = !isFinalized && isMultiAttempt && (optInStatus === "PENDING" || optInStatus === "DECLINED");

      let statusDisplay;
      let statusClass;
      if (status === "answered") {
        statusDisplay = optInStatus === "SUBMITTED" ? "Submitted" : "Answered";
        statusClass = "answered";
      } else if (status === "closed") {
        statusDisplay = "Closed";
        statusClass = "closed";
      } else if (status === "cancelled") {
        statusDisplay = "Cancelled";
        statusClass = "cancelled";
      } else if (status === "expired") {
        statusDisplay = "Expired";
        statusClass = "expired";
      } else if (status === "completed") {
        statusDisplay = "Completed";
        statusClass = "completed";
      } else if (isFailedPosting) {
        statusDisplay = "Failed Posting";
        statusClass = "failed";
      } else if (isDeclined) {
        statusDisplay = "Declined";
        statusClass = "declined";
      } else if (status === "active") {
        statusDisplay = "Active";
        statusClass = "active";
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

      const statusKeyForBadge = isFailedPosting ? "failed_posting" : status;
      const procurementStatusClass = toBadgeClass(procurementStatus, statusClass);
      statusClass = toBadgeClass(statusKeyForBadge, statusClass);

      // Allow submission on repost/attempts even if an explicit opt-in decision was not recorded;
      // only block for finalized, failed, answered, or declined states.
      const canSubmit = !isFinalized && !isFailedPosting && status !== "answered" && !isDeclined;

      let submissionLockReason = "";
      if (!canSubmit) {
        if (isFinalized) {
          if (procurementStatus === "completed") {
            submissionLockReason = "Admin marked this announcement as Completed. Submissions are closed.";
          } else if (procurementStatus === "failed_posting") {
            submissionLockReason = "This posting is marked as Failed Posting. No further submissions are accepted.";
          } else {
            submissionLockReason = "This announcement is closed.";
          }
        } else if (isFailedPosting) {
          submissionLockReason = "This posting is marked as Failed Posting. No further submissions are accepted.";
        } else if (status === "answered") {
          submissionLockReason = "You already submitted a response for this attempt.";
        } else if (requiresDecision) {
          submissionLockReason = "Confirm participation before you can submit.";
        } else if (isDeclined) {
          submissionLockReason = "You declined this attempt.";
        }
      }

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
        decisionBanner = "You submitted. Waiting for the Results.";
        if (latestStatusNote) {
          decisionBanner = `${decisionBanner} ${latestStatusNote}`.trim();
        }
        decisionBannerClass = "submitted";
      }

      return {
        ...file,
        endDateObj,
        dateSentObj,
        postedDateObj,
        attemptCount,
        attemptLabel: attemptCount > 1 ? `${formatOrdinal(attemptCount)} attempt` : "New posting",
        latestStatusLabel,
        latestStatusKey,
        latestStatusAt,
        latestStatusNote,
        showLatestUpdate,
        descriptionText,
        procurementStatus,
        procurementStatusLabel: formatStatusLabel(procurementStatus),
        procurementStatusClass,
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
        submissionLockReason,
        failedPostingDetail: failedPostingDetail || null,
        decisionBanner,
        decisionBannerClass,
        searchIndex: `${file.Title || ""} ${descriptionText} ${(file.categories || "")}`.toLowerCase(),
        isFinalized,
        hasViewed,
      };
    });
  }, [assignedFiles, viewedFileIds]);

  const selectedFile = useMemo(
    () => processedFiles.find((file) => file.SupplierFileID === selectedFileId) || null,
    [processedFiles, selectedFileId]
  );

  const statsSummary = useMemo(() => {
    const total = processedFiles.length;
    const answered = processedFiles.filter((file) => file.normalizedStatus === "answered").length;
    const pending = processedFiles.filter((file) => !file.isFinalized && file.normalizedStatus !== "answered" && !file.isFailedPosting).length;
    const completed = processedFiles.filter((file) => file.normalizedStatus === "completed").length;
    const failed = processedFiles.filter((file) => file.isFailedPosting).length;
    return { total, answered, pending, completed, failed };
  }, [processedFiles]);

  const filteredFiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return processedFiles
      .filter((file) => {
        if (query && !file.searchIndex.includes(query)) {
          return false;
        }

        if (statusFilter === "Pending") {
          return !file.isFinalized && file.normalizedStatus !== "answered" && !file.isFailedPosting;
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortOption]);

  const handleRequireFile = () => {
    setToast({ visible: true, type: "warning", message: "Please attach your quotation PDF before submitting." });
  };

  const formatDateTime = (value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      return "Not recorded";
    }
    return value.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / PAGE_SIZE));
  const normalizedPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (normalizedPage - 1) * PAGE_SIZE;
  const paginatedFiles = filteredFiles.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);
  const showingStart = filteredFiles.length === 0 ? 0 : pageStartIndex + 1;
  const showingEnd = filteredFiles.length === 0 ? 0 : pageStartIndex + paginatedFiles.length;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="supplier-dashboard">
      <Toast
        type={toast.type}
        message={toast.message}
        visible={toast.visible}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
        duration={3200}
      />
      <section className="supplier-top-card">
        <div className="supplier-header-intro">
          <span className="supplier-header-tagline">MSSS Supplier Workspace</span>
          <h2>Assigned Procurement Files</h2>
          <p>Stay on top of your assigned procurement requests and submit quotations before the deadlines.</p>
          <p className="supplier-header-contact">
            For inquiries, email <a href="mailto:sdomarketscoping@gmail.com">sdomarketscoping@gmail.com</a> or call 09258814880.
          </p>
        </div>
      </section>

      <section className="supplier-metrics-panel">
        <div className="supplier-metrics-grid">
          <div className="supplier-metric-card">
            <span className="metric-label">Total Assignments</span>
            <span className="metric-value">{statsSummary.total}</span>
          </div>
          <div className="supplier-metric-card">
            <span className="metric-label">Pending Actions</span>
            <span className="metric-value">{statsSummary.pending}</span>
          </div>
          <div className="supplier-metric-card">
            <span className="metric-label">Answered</span>
            <span className="metric-value">{statsSummary.answered}</span>
          </div>
          <div className="supplier-metric-card metric-accent">
            <span className="metric-label">Completed</span>
            <span className="metric-value">{statsSummary.completed}</span>
          </div>
          <div className="supplier-metric-card metric-accent">
            <span className="metric-label">Failed Posting</span>
            <span className="metric-value">{statsSummary.failed}</span>
          </div>
        </div>
        <div className="supplier-metrics-footer">
          <span className="metric-label">Last Updated</span>
          <span className="metric-value">
            {lastUpdated
              ? lastUpdated.toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Awaiting sync"}
          </span>
        </div>
      </section>

      {isLoading && (
        <div className="supplier-loading">
          <div className="loading-spinner" aria-hidden />
          <p>Loading files...</p>
        </div>
      )}
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
        {filteredFiles.length > 0 && (
          <div className="pagination-wrapper top">
            <div className="pagination-summary">{`Showing ${showingStart}-${showingEnd} of ${filteredFiles.length}`}</div>
            <Pagination
              currentPage={normalizedPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              previewCount={7}
            />
          </div>
        )}

        {!isLoading && !error && filteredFiles.length === 0 && (
          <p>
            {assignedFiles.length === 0
              ? "No procurement files have been assigned to you yet."
              : "No assignments match your current filters."}
          </p>
        )}
        {paginatedFiles.map((file) => {
          const isExpanded = expandedFileId === file.SupplierFileID;
          const isViewed = Boolean(file.hasViewed);
          const showNewPill = !isViewed;
          const showProcurementBadge =
            Boolean(file.procurementStatusLabel) &&
            String(file.procurementStatusLabel).toLowerCase() !== String(file.statusDisplay || "").toLowerCase();
          const showRepostedBadge = Number(file.attemptCount) > 1;
          const cardClassName = [
            "post-card",
            file.dueState,
            file.normalizedStatus,
            file.isFailedPosting ? "failed-posting" : "",
            file.isDeclined ? "declined" : "",
            file.requiresDecision ? "awaiting-decision" : "",
            isExpanded ? "expanded" : "",
            isViewed ? "viewed" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const optInStatusLabel = file.optInStatus ? formatStatusLabel(file.optInStatus) : "Pending";
          const expandedSectionId = `supplier-post-${file.SupplierFileID}-details`;

          const handleOpenSubmission = (event) => {
            event.stopPropagation();
            if (!file.canSubmit) {
              setToast({
                visible: true,
                type: "info",
                message: file.submissionLockReason || "Submissions are closed for this announcement.",
              });
              return;
            }
            handleOpenModal(file);
          };

          const handleOpenTimeline = (event) => {
            event.stopPropagation();
            handleViewTimeline(file);
          };

          const handleQuickToggle = (event) => {
            event.stopPropagation();
            handleToggleExpand(file);
          };

          const latestStatusClass = (file.latestStatusKey || file.normalizedStatus || "")
            .replace(/[_\s]+/g, "-")
            .replace(/-+$/, "")
            .trim();

          return (
            <div
              key={file.SupplierFileID}
              className={cardClassName}
              onClick={() => handleToggleExpand(file)}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-controls={expandedSectionId}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleToggleExpand(file);
                }
              }}
            >
              <div className="post-card-header">
                <h3 className="post-title">{file.Title}</h3>
                <div className="post-card-header-actions">
                  {showNewPill && <span className="new-pill">New</span>}
                  <span className={`status-badge ${file.statusClass}`}>{file.statusDisplay}</span>
                  {showRepostedBadge && (
                    <span className="status-badge reposted" title={file.attemptLabel}>
                      Reposted • {file.attemptLabel || "2nd attempt"}
                    </span>
                  )}
                    {showProcurementBadge && (
                      <span className={`status-badge procurement ${file.procurementStatusClass}`}>
                        {file.procurementStatusLabel}
                      </span>
                    )}
                </div>
              </div>

              <div className="post-card-body">
                <p className="post-description">
                  {file.descriptionText.length > 120
                    ? `${file.descriptionText.substring(0, 117)}...`
                    : file.descriptionText || "No description provided."}
                </p>
              </div>

              {isExpanded && (
                <div
                  id={expandedSectionId}
                  className="post-card-expanded"
                  onClick={(event) => event.stopPropagation()}
                >
                  {file.decisionBanner && (
                    <p className={`post-decision expanded ${file.decisionBannerClass || ""}`.trim()}>
                      {file.decisionBanner}
                    </p>
                  )}

                  <div className="post-card-expanded-grid">
                    <div className="post-card-expanded-item">
                      <span className="post-card-expanded-label">Status</span>
                      <span className="post-card-expanded-value">{file.statusDisplay}</span>
                    </div>

                    <div className="post-card-expanded-item">
                      <span className="post-card-expanded-label">Announcement Status</span>
                      <span className="post-card-expanded-value">{file.procurementStatusLabel}</span>
                    </div>

                    <div className="post-card-expanded-item">
                      <span className="post-card-expanded-label">Deadline</span>
                      <div className="post-card-expanded-value post-card-expanded-deadline">
                        <span className={`due-chip ${file.dueState} ${file.isFailedPosting ? "failed-posting" : ""}`}>
                          {file.dueLabel}
                        </span>
                        {file.endDateObj && (
                          <span className="post-card-expanded-muted">
                            {file.endDateObj.toLocaleString("en-US", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                              timeZone: "Asia/Singapore",
                            })}
                          </span>
                        )}
                        {file.failedPostingDetail && (
                          <span className="post-card-expanded-muted">{file.failedPostingDetail}</span>
                        )}
                      </div>
                    </div>

                    <div className="post-card-expanded-item">
                      <span className="post-card-expanded-label">Attempt</span>
                      <span className="post-card-expanded-value">{file.attemptLabel}</span>
                    </div>

                    <div className="post-card-expanded-item">
                      <span className="post-card-expanded-label">Participation</span>
                      <span className="post-card-expanded-value">{optInStatusLabel}</span>
                      {file.optedInAt && (
                        <span className="post-card-expanded-subtle">Opted in {formatDateTime(file.optedInAt)}</span>
                      )}
                      {file.declinedAt && (
                        <span className="post-card-expanded-subtle">Declined {formatDateTime(file.declinedAt)}</span>
                      )}
                    </div>

                    <div className="post-card-expanded-item">
                      <span className="post-card-expanded-label">Posted</span>
                      <span className="post-card-expanded-value">{formatDateTime(file.postedDateObj)}</span>
                    </div>

                    {file.dateSentObj && (
                      <div className="post-card-expanded-item">
                        <span className="post-card-expanded-label">Assigned</span>
                        <span className="post-card-expanded-value">{formatDateTime(file.dateSentObj)}</span>
                      </div>
                    )}

                    {file.lastResponse && file.lastResponse.uploadedAt && (
                      <div className="post-card-expanded-item">
                        <span className="post-card-expanded-label">Last Submission</span>
                        <span className="post-card-expanded-value">{formatDateTime(file.lastResponse.uploadedAt)}</span>
                      </div>
                    )}

                  </div>

                  {file.showLatestUpdate && (
                    <div className="post-card-expanded-wide">
                      <h4>Latest Notes / Reasons</h4>
                      <div className="post-card-expanded-note">
                        {file.latestStatusNote && <p>{file.latestStatusNote}</p>}
                        {file.latestStatusAt && <span>{formatDateTime(file.latestStatusAt)}</span>}
                      </div>
                    </div>
                  )}

                  <div className="post-card-expanded-wide">
                    <h4>Description</h4>
                    <p className="post-card-expanded-description">
                      {file.descriptionText || "No description provided."}
                    </p>
                  </div>

                  <div className="post-card-expanded-wide">
                    <h4>Categories</h4>
                    {file.categoryList.length === 0 ? (
                      <span className="post-card-expanded-empty">No categories provided</span>
                    ) : (
                      <div className="post-card-expanded-chip-grid">
                        {file.categoryList.map((category) => (
                          <span key={category} className="post-card-expanded-chip">
                            {category}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="post-card-expanded-actions">
                    <button
                      type="button"
                      className="card-primary-btn"
                      onClick={handleOpenSubmission}
                      disabled={!file.canSubmit}
                    >
                      Open Submission
                    </button>
                    <button type="button" className="card-secondary-btn" onClick={handleOpenTimeline}>
                      View Timeline
                    </button>
                    <button
                      type="button"
                      className="card-tertiary-btn"
                      onClick={handleQuickToggle}
                    >
                      Close Quick View
                    </button>
                  </div>

                  {!file.canSubmit && (
                    <div className="submission-locked-banner">
                      <span className="submission-locked-dot" />
                      <div>
                        <p className="submission-locked-title">Submission closed</p>
                        <p className="submission-locked-reason">{file.submissionLockReason || "This announcement is closed."}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredFiles.length > 0 && (
        <div className="pagination-wrapper">
          <div className="pagination-summary">{`Showing ${showingStart}-${showingEnd} of ${filteredFiles.length}`}</div>
          <Pagination
            currentPage={normalizedPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            previewCount={7}
          />
        </div>
      )}

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
          onReuse={handleReuseResponse}
          isReusing={reuseState.loading && reuseState.supplierFileId === selectedFile.SupplierFileID}
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