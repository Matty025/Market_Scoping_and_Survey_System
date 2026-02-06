  // Clean version with unified filter and dynamic categories
  import React, { useState, useEffect, useMemo } from "react";
  import { useNavigate } from "react-router-dom";
  import api from "../../api";
  import axios from "axios";
  import AnnouncementForm from "../../components/AnnouncementForm";
  import StatsSection from "../../components/StatsSection";
  import ResponseModal from "../../components/ResponseModal";
  import StatusUpdateModal from "../../components/StatusUpdateModal";
  import StatusHistoryModal from "../../components/StatusHistoryModal";
  import { useAuth } from "../../components/AuthContext";
  import Toast from "../../components/Toast";
  import { FaUsers, FaBoxOpen, FaCheckCircle, FaClock, FaClipboardList, FaTag, FaUserCheck } from "react-icons/fa";
  import BuyerRequestsSection from "../../components/BuyerRequestsSection";
  import Pagination from "../../components/Pagination";
  import "./Dashboard.css";

  const PAGE_SIZE = 50;
  const PARENT_CATEGORY_NAMES = new Set(["GOODS", "INFRASTRUCTURE PROJECTS", "CONSULTING SERVICES"]);

  const STATUS_BADGE_COLORS = {
    PENDING: "#f59e0b",
    SENT: "#2563eb",
    ANSWERED: "#10b981",
    COMPLETED: "#22c55e",
    DECLINED: "#ef4444",
    CANCELLED: "#ef4444",
    CANCELLED_: "#ef4444",
    EXPIRED: "#6b7280",
    ARCHIVED: "#6b7280",
    CLOSED: "#6b7280",
    ACTIVE: "#2563eb",
    AWARDED: "#16a34a",
    FAILED_POSTING: "#dc2626",
  };

  const STATUS_LABELS = {
    ACTIVE: "Active",
    CLOSED: "Closed",
    AWARDED: "Awarded",
    CANCELLED: "Cancelled",
    EXPIRED: "Expired",
    PENDING: "Pending",
    SENT: "Sent",
    ANSWERED: "Answered",
    COMPLETED: "Completed",
    DECLINED: "Declined",
    ARCHIVED: "Archived",
    FAILED_POSTING: "Failed Posting",
  };

  const normalizeStatus = (status) => (status ? String(status).toUpperCase() : "");

  const FINALIZED_STATUSES = new Set(["COMPLETED"]);

  const deriveAnnouncementStatus = (status, isExpired) => {
    const normalized = normalizeStatus(status);
    if (normalized === "FAILED_POSTING") {
      return "FAILED_POSTING";
    }

    if (isExpired && !FINALIZED_STATUSES.has(normalized)) {
      return "FAILED_POSTING";
    }

    return normalized || "PENDING";
  };

  const isFailedPostingStatus = (status, isExpired) => deriveAnnouncementStatus(status, isExpired) === "FAILED_POSTING";

  const STATUS_CONFIRMATION_MESSAGES = {
    ACTIVE: "Repost this announcement and mark it as active again?",
    COMPLETED: "Mark this announcement as completed?",
    FAILED_POSTING: "Mark this announcement as failed posting?",
  };

  const STATUSES_REQUIRING_NOTES = new Set([]);
  const STATUS_CHOICES = ["ACTIVE", "COMPLETED", "FAILED_POSTING"];

  const DEFAULT_TIME_ZONE = "Asia/Manila";
  const ANNOUNCEMENT_TIME_ZONE = DEFAULT_TIME_ZONE;
  const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  const MIDNIGHT_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T00:00(:00(\.000)?)?Z$/i;

  const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ANNOUNCEMENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parseDatePreservingEndOfDay = (value) => {
    if (!value) return null;

    const setToEndOfDayManila = (year, month, day) => new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999));

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (DATE_ONLY_REGEX.test(trimmed)) {
        const [year, month, day] = trimmed.split("-").map(Number);
        // Treat YYYY-MM-DD as 11:59 PM Asia/Manila (15:59 UTC) to match end-of-day expectation.
        return setToEndOfDayManila(year, month, day);
      }

      if (MIDNIGHT_UTC_REGEX.test(trimmed)) {
        const [datePart] = trimmed.split("T");
        const [year, month, day] = datePart.split("-").map(Number);
        // Handle ISO midnight Z as an all-day date; shift to 11:59 PM Asia/Manila.
        return setToEndOfDayManila(year, month, day);
      }
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;

    // Heuristic: if parsed UTC time is exactly midnight, treat as all-day and move to end-of-day SGT.
    if (parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0) {
      const year = parsed.getUTCFullYear();
      const month = parsed.getUTCMonth() + 1;
      const day = parsed.getUTCDate();
      return setToEndOfDayManila(year, month, day);
    }

    return parsed;
  };

  const isPastInManila = (dateObj) => {
    if (!dateObj || Number.isNaN(dateObj.getTime())) {
      return false;
    }

    const todayStr = manilaDateFormatter.format(new Date());
    const targetStr = manilaDateFormatter.format(dateObj);
    return targetStr < todayStr;
  };

  const STATUS_DIALOG_INITIAL = {
    visible: false,
    status: null,
    message: "",
    announcement: null,
    notes: "",
    statusOptions: [],
    error: null,
    submitting: false,
  };

  const HISTORY_MODAL_INITIAL = {
    visible: false,
    announcement: null,
    records: [],
    loading: false,
    error: null,
  };

  const getStatusBadgeColor = (status) => {
    if (!status) return "#4b5563";
    const normalized = String(status).toUpperCase();
    return STATUS_BADGE_COLORS[normalized] || "#4b5563";
  };

  const formatStatusLabel = (status) => {
    if (!status) return "Unknown";
    const normalized = String(status).toUpperCase();
    if (STATUS_LABELS[normalized]) {
      return STATUS_LABELS[normalized];
    }
    return normalized
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
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

  const toNullableNumber = (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseIdList = (input) => {
    if (Array.isArray(input)) {
      const ids = input
        .map((item) => {
          if (item === null || item === undefined) return null;
          if (typeof item === "object") {
            const candidate =
              item.id ?? item.ID ?? item.Id ?? item.supplier_id ?? item.SupplierID ?? item.value;
            if (candidate !== undefined && candidate !== null) {
              const num = Number(candidate);
              return Number.isNaN(num) ? String(candidate) : num;
            }
            return null;
          }
          const num = Number(item);
          return Number.isNaN(num) ? String(item) : num;
        })
        .filter((val) => val !== null && val !== undefined);
      return Array.from(new Set(ids));
    }

    if (typeof input === "string") {
      const trimmed = input.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parseIdList(parsed);
        }
      } catch (err) {
        // ignore JSON parse errors
      }

      return trimmed
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const num = Number(part);
          return Number.isNaN(num) ? part : num;
        });
    }

    return [];
  };

  const parseNameList = (input) => {
    if (Array.isArray(input)) {
      return input
        .map((item) => (item === null || item === undefined ? "" : String(item)))
        .map((str) => str.trim())
        .filter(Boolean);
    }
    if (typeof input === "string") {
      return input
        .split(/[,\n]/)
        .map((str) => str.trim())
        .filter(Boolean);
    }
    return [];
  };

  const mapCategoryNamesToIds = (names, nameIndex) => {
    if (!Array.isArray(names) || names.length === 0) {
      return [];
    }
    const ids = names
      .map((name) => nameIndex[name.trim().toUpperCase()])
      .filter((id) => id !== undefined && id !== null);
    return Array.from(new Set(ids));
  };

  const parseAnnouncementsResponse = (payload) => {
    if (Array.isArray(payload)) {
      return {
        items: payload,
        total: payload.length,
        page: 1,
        limit: payload.length
      };
    }

    if (!payload || typeof payload !== "object") {
      return { items: [], total: 0, page: 1, limit: PAGE_SIZE };
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    const total = Number(payload.total ?? payload.count ?? items.length) || 0;
    const page = Number(payload.page ?? payload.currentPage ?? 1) || 1;
    const limit = Number(payload.limit ?? payload.pageSize ?? PAGE_SIZE) || PAGE_SIZE;

    return { items, total, page, limit };
  };

  const CategoryModal = ({ categories, onClose }) => {
    const groupedCategories = {
      "GOODS": [],
      "INFRASTRUCTURE PROJECTS": [],
      "CONSULTING SERVICES": [],
      "Other": []
    };

    categories.forEach(cat => {
      const catUpper = cat.toUpperCase();
      
      if (catUpper === "UNCATEGORIZED" || catUpper === "SUPPLIER-SPECIFIC") {
        return;
      }
      
      if (catUpper === "GOODS" || catUpper === "INFRASTRUCTURE PROJECTS" || catUpper === "CONSULTING SERVICES") {
        return;
      }
      
      if (["OFFICE SUPPLIES & DEVICES", "IT EQUIPMENT & PERIPHERALS", "EDUCATIONAL & INSTRUCTIONAL MATERIALS",
          "FURNITURE & FIXTURES", "SPORTS & PHYSICAL EDUCATION EQUIPMENT", "LABORATORY EQUIPMENT & SUPPLIES",
          "ELECTRICAL & ELECTRONIC SUPPLIES", "CLEANING & JANITORIAL SUPPLIES", "MEDICAL & FIRST AID SUPPLIES",
          "VEHICLES, TOOLS & MACHINERY", "PRINTING & REPRODUCTION SERVICES", "UNIFORMS, APPAREL & FABRICS",
          "FOOD & CATERING SUPPLIES", "GENERAL SUPPORT SERVICES"].includes(catUpper)) {
        groupedCategories["GOODS"].push(cat);
      }
      else if (["SCHOOL BUILDING CONSTRUCTION", "SCHOOL BUILDING REHABILITATION", "WATER SUPPLY & SANITATION SYSTEMS",
                "ELECTRICAL & POWER SYSTEMS", "SITE DEVELOPMENT & LANDSCAPING", "ROOFING AND PAINTING WORKS",
                "MINOR REPAIRS & MAINTENANCE WORK"].includes(catUpper)) {
        groupedCategories["INFRASTRUCTURE PROJECTS"].push(cat);
      }
      else if (["ARCHITECTURAL & ENGINEERING DESIGN", "FEASIBILITY & PROJECT STUDIES", "CONSTRUCTION SUPERVISION",
                "ICT SYSTEM DEVELOPMENT", "RESEARCH & EVALUATION STUDIES"].includes(catUpper)) {
        groupedCategories["CONSULTING SERVICES"].push(cat);
      }
      else {
        groupedCategories["Other"].push(cat);
      }
    });

    const totalCategories = Object.values(groupedCategories).reduce((sum, cats) => sum + cats.length, 0);

    return (
      <div className="modal-overlay" onClick={(e) => e.target.classList.contains("modal-overlay") && onClose()}>
        <div className="modal" style={{ maxWidth: "600px" }}>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            ✖
          </button>
          <h3 style={{ marginBottom: "20px" }}>📁 Categories ({totalCategories})</h3>
          <div style={{ maxHeight: "500px", overflowY: "auto", padding: "10px" }}>
            {totalCategories === 0 ? (
              <p style={{ textAlign: "center", color: "#666", padding: "20px" }}>
                No categories assigned to this announcement
              </p>
            ) : (
              <>
                {Object.entries(groupedCategories).map(([parent, subcats]) => {
                  if (subcats.length === 0) return null;
                  return (
                    <div key={parent} style={{ marginBottom: "25px" }}>
                      <h4 style={{
                        fontSize: "16px",
                        fontWeight: "bold",
                        color: "#1f2937",
                        marginBottom: "10px",
                        paddingBottom: "8px",
                        borderBottom: "2px solid #3b82f6"
                      }}>
                        {parent}
                      </h4>
                      <ul style={{ listStyle: "none", padding: 0, paddingLeft: "15px" }}>
                        {subcats.map((cat, idx) => (
                          <li
                            key={idx}
                            style={{
                              padding: "8px 12px",
                              margin: "5px 0",
                              background: "#f9fafb",
                              borderRadius: "6px",
                              border: "1px solid #e5e7eb",
                              fontSize: "14px"
                            }}
                          >
                            └─ {cat}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const AnnouncementCard = ({
    announcement,
    onShowCategories,
    onShowSuppliers,
    onToggleExpand,
    onUpdateStatus,
    onRepost,
    isStatusUpdating,
    expanded = false,
    onOpenResponses,
    onOpenHistory,
    onNavigateDetail,
  }) => {
    const rawCats = announcement.categories || announcement.categoryDisplay || announcement.category || "";
    const isSupplierSpecific = announcement.sendType === "supplier" || announcement.SendType === "supplier";
    const supplierObjects = Array.isArray(announcement.supplierObjects)
      ? announcement.supplierObjects
      : [];
    const supplierNames = supplierObjects.length > 0
      ? supplierObjects.map((s) => s.name).filter(Boolean)
      : (Array.isArray(announcement.suppliers)
          ? announcement.suppliers
          : parseNameList(announcement.suppliers));
    const supplierModalPayload = supplierObjects.length > 0
      ? supplierObjects
      : supplierNames.map((name) => ({ name, email: "" }));
    const hasSuppliersForModal = supplierModalPayload.length > 0;
    const supplierIdsList = parseIdList(
      announcement.supplierIds ||
        announcement.SupplierIDs ||
        announcement.supplier_ids ||
        announcement.suppliersIds ||
        announcement.suppliers_ids ||
        announcement.assignedSupplierIds ||
        announcement.assigned_suppliers ||
        []
    );
    const responseCountRaw =
      announcement.respondingSupplierCount ??
      announcement.responseCount ??
      announcement.responsecount ??
      announcement.responses ??
      0;
    const responseCountNum = Number(responseCountRaw);
    const responseCount = Number.isNaN(responseCountNum) ? 0 : responseCountNum;
    const hasResponses = announcement.hasResponses ?? responseCount > 0;

    const rawStatus = normalizeStatus(
      announcement.status ??
        announcement.procurementStatus ??
        announcement.procurement_status ??
        ""
    );
    const computedExpired = Boolean(
      announcement.isExpired ??
        announcement.isexpired ??
        rawStatus === "EXPIRED"
    );
    const derivedStatus = normalizeStatus(
      announcement.derivedStatus ?? deriveAnnouncementStatus(rawStatus, computedExpired)
    );
    const statusLabel = formatStatusLabel(derivedStatus);
    const statusColor = getStatusBadgeColor(derivedStatus);
    const isFailedPosting = derivedStatus === "FAILED_POSTING";
    const isCompletedStatus = derivedStatus === "COMPLETED";
    const isExpired = Boolean(computedExpired);
    const isFinalStatus = FINALIZED_STATUSES.has(derivedStatus);
    let baseClassName = "announcement-card";
    if (isCompletedStatus) {
      baseClassName += " awarded";
    } else if (isFailedPosting) {
      baseClassName += " failed-posting";
    } else if (isExpired) {
      baseClassName += " expired";
    }
    const cardClassName = expanded ? `${baseClassName} expanded` : baseClassName;

    const seenCategories = new Set();
    const catsArr = isSupplierSpecific
      ? []
      : String(rawCats)
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
          .filter((s) => {
            const upper = s.toUpperCase();
            if (upper === "UNCATEGORIZED" || upper === "SUPPLIER-SPECIFIC") {
              return false;
            }
            if (PARENT_CATEGORY_NAMES.has(upper)) {
              return false;
            }
            if (seenCategories.has(upper)) {
              return false;
            }
            seenCategories.add(upper);
            return true;
          });

    const firstTwoSuppliers = supplierNames.slice(0, 2);
    const remainingSuppliers = Math.max(0, supplierNames.length - firstTwoSuppliers.length);

    const assignedSupplierCount =
      toNullableNumber(announcement.totalSuppliersAssigned) ??
      toNullableNumber(announcement.assignedSupplierCount) ??
      supplierNames.length;
    const pendingSupplierCount = toNullableNumber(announcement.pendingSupplierCount);
    const answeredSupplierCount =
      toNullableNumber(announcement.answeredSupplierCount) ??
      toNullableNumber(announcement.completedSupplierCount);
    const supplierProgressParts = [];
    if (typeof pendingSupplierCount === "number" && pendingSupplierCount > 0) {
      supplierProgressParts.push(`Pending: ${pendingSupplierCount}`);
    }
    if (typeof answeredSupplierCount === "number" && answeredSupplierCount > 0) {
      supplierProgressParts.push(`Answered: ${answeredSupplierCount}`);
    }

    const attemptCountRaw = toNullableNumber(announcement.attemptNumber);
    const attemptCount = attemptCountRaw && attemptCountRaw > 0 ? attemptCountRaw : 1;
    const attemptStatusRaw = announcement.attemptStatus || announcement.attempt_status || "";
    const attemptStatus = attemptStatusRaw ? attemptStatusRaw.toString().toUpperCase() : "";
    const procurementStatusRaw = announcement.procurementStatus || announcement.procurement_status || "";
    const procurementStatus = procurementStatusRaw
      ? procurementStatusRaw.toString().toUpperCase()
      : derivedStatus;
    const procurementBadgeColor = getStatusBadgeColor(procurementStatus);
    const attemptSentAt = announcement.attemptSentAt || announcement.attempt_sent_at || null;
    const attemptDueAt = announcement.attemptDueAt || announcement.attempt_due_at || null;
    const awardedSupplierName = "";
    const normalizedWinnerName = "";
    const showWinnerBadge = false;
    const descriptionText = announcement.description && announcement.description.trim().length > 0
      ? announcement.description
      : "No description provided yet.";
    const summarySnippet = descriptionText.length > 160 ? `${descriptionText.slice(0, 157)}…` : descriptionText;
    const postedDisplay = announcement.posted || "Not available";
    const endDisplay = announcement.end || "Not available";
    const hasAttachment = Boolean((announcement.file && announcement.file.name) || announcement.fileName);
    const attachmentName = (announcement.file && announcement.file.name) || announcement.fileName || "";
    const engagementSummary = supplierProgressParts.length > 0 ? supplierProgressParts.join(" | ") : null;

    const formatShortDateTime = (isoValue) => {
      if (!isoValue) return null;
      const date = new Date(isoValue);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    };

    const attemptSentDisplayShort = formatShortDateTime(attemptSentAt);
    const attemptDueDisplayShort = attemptDueAt
      ? (() => {
          const parsedDue = parseDatePreservingEndOfDay(attemptDueAt);
          if (!parsedDue) {
            return null;
          }
          return parsedDue.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: DEFAULT_TIME_ZONE,
          });
        })()
      : null;

    const attemptTimelineCompact = [];
    if (attemptSentDisplayShort) {
      attemptTimelineCompact.push(`Sent ${attemptSentDisplayShort}`);
    }
    if (attemptDueDisplayShort) {
      attemptTimelineCompact.push(`Due ${attemptDueDisplayShort}`);
    }
    const attemptLabel = attemptCount ? `${formatOrdinal(attemptCount)} Attempt` : "Attempt Pending";
    const supplierCount = supplierObjects.length > 0 ? supplierObjects.length : supplierNames.length;
    const suppliersSummary = supplierCount > 0
      ? (supplierNames.length > 0
        ? (supplierNames.length > 4
          ? `${supplierNames.slice(0, 4).join(", ")} +${supplierNames.length - 4} more`
          : supplierNames.join(", "))
        : `${supplierCount} supplier${supplierCount === 1 ? "" : "s"}`)
      : "Category-based delivery (no direct assignees)";
    const attemptTimelineDetailed = attemptTimelineCompact.length > 0
      ? attemptTimelineCompact.join(" | ")
      : "No attempt timeline recorded yet";

    const handleCardClick = () => {
      onToggleExpand?.();
    };

    const handleCardKeyDown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggleExpand?.();
      }
    };

    const handleExpandedClick = (event) => {
      event.stopPropagation();
    };

    const handleOpenResponses = (event) => {
      event.stopPropagation();
      onOpenResponses?.();
    };

    const handleOpenHistory = (event) => {
      event.stopPropagation();
      onOpenHistory?.();
    };

    const handleNavigateDetailClick = (event) => {
      event.stopPropagation();
      onNavigateDetail?.();
    };

    const handleStatusAction = (event, nextStatus) => {
      event.stopPropagation();
      if (String(nextStatus || "").toUpperCase() === "ACTIVE") {
        onRepost?.(announcement);
        return;
      }
      if (String(nextStatus || "").toUpperCase() === "UPDATE_STATUS") {
        onUpdateStatus?.(derivedStatus || "ACTIVE", true);
        return;
      }
      if (onUpdateStatus) {
        onUpdateStatus(nextStatus);
      }
    };

    const handleShowSuppliersList = (event) => {
      event.stopPropagation();
      if (!hasSuppliersForModal) return;
      onShowSuppliers?.(supplierModalPayload);
    };

    const handleShowCategoriesList = (event) => {
      event.stopPropagation();
      if (!catsArr.length) return;
      onShowCategories?.(catsArr);
    };

    const actionButtons = [];
    const canMarkWinner = !isCompletedStatus;
    const canRepost = isFailedPosting;

    if (canMarkWinner) {
      actionButtons.push({
        status: "COMPLETED",
        label: "Mark as Completed",
        variant: "primary",
        disabled: false,
        tooltip: undefined,
      });
    }

    // Quick status picker for debugging
    actionButtons.push({ status: "UPDATE_STATUS", label: "Update Status" });

    if (canRepost) {
      actionButtons.push({ status: "ACTIVE", label: "Repost", variant: "primary" });
    }

    const shouldShowProcurementBadge =
      procurementStatus && procurementStatus !== derivedStatus && procurementStatus !== attemptStatus;

    return (
      <div
        className={cardClassName}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
      >
        <div className="announcement-header">
          <h4>{announcement.title}</h4>
          <div className="announcement-header-right">
            {isSupplierSpecific ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="badge badge-action"
                  style={{ backgroundColor: "#8b5cf6", color: "#fff" }}
                  title={hasSuppliersForModal ? "View supplier recipients" : "No suppliers listed"}
                  disabled={!hasSuppliersForModal}
                  onClick={handleShowSuppliersList}
                >
                  {supplierNames.length === 0
                    ? "No suppliers"
                    : supplierNames.length <= 2
                      ? `👥 Sent to ${supplierNames.join(", ")}`
                      : `👥 Sent to ${firstTwoSuppliers.join(", ")} +${remainingSuppliers} more`}
                </button>
              </div>
            ) : catsArr.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="badge badge-action"
                  title="View categories"
                  onClick={handleShowCategoriesList}
                >
                  📂 {catsArr.length} {catsArr.length === 1 ? "category" : "categories"}
                </button>
                {hasSuppliersForModal && (
                  <button
                    type="button"
                    className="badge badge-action"
                    style={{ backgroundColor: "#0f172a", color: "#fff" }}
                    title="View supplier recipients"
                    onClick={handleShowSuppliersList}
                  >
                    👥 Suppliers: {supplierModalPayload.length}
                  </button>
                )}
              </div>
            ) : (
              <span className="badge" style={{ backgroundColor: "#6b7280" }}>
                No categories
              </span>
            )}
            {showWinnerBadge && (
              <span className="badge badge-awarded">
                {normalizedWinnerName.length > 0 ? `🏆 Winner: ${normalizedWinnerName}` : "🏆 Winner Selected"}
              </span>
            )}
          </div>
        </div>
        {expanded && (
          <div
            className="announcement-metadata"
            style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}
          >
            {attemptCount ? (
              <span className="badge" style={{ backgroundColor: "#1f2937" }}>
                {`${formatOrdinal(attemptCount)} Attempt`}
              </span>
            ) : null}
            {shouldShowProcurementBadge ? (
              <span className="badge" style={{ backgroundColor: procurementBadgeColor }}>
                Procurement {procurementStatus}
              </span>
            ) : null}
          </div>
        )}
        <div className="announcement-preview">
          <p className="announcement-preview-summary">{summarySnippet}</p>
          {engagementSummary && expanded && (
            <p className="announcement-preview-line">Engagement: {engagementSummary}</p>
          )}
          {/* Winner removed; only completion status remains */}
          {hasAttachment && expanded && (
            <p className="announcement-preview-line">Attachment: {attachmentName}</p>
          )}
        </div>
        <div className="announcement-status-bar">
          <span className="status-pill" style={{ backgroundColor: statusColor }}>
            {statusLabel}
          </span>
          {attemptCount > 1 && (
            <span className="status-pill" style={{ backgroundColor: "#8b5cf6" }}>
              Reposted · Attempt {attemptCount}
            </span>
          )}
          {actionButtons.length > 0 && (
            <div className="status-action-group">
              {actionButtons.map((action) => {
                const classNames = ["status-action-btn"];
                if (action.variant === "primary") {
                  classNames.push("status-action-btn--primary");
                }
                return (
                  <button
                    key={action.status}
                    type="button"
                    className={classNames.join(" ")}
                    disabled={Boolean(isStatusUpdating || action.disabled)}
                    title={action.tooltip}
                    onClick={(event) => handleStatusAction(event, action.status)}
                  >
                    {isStatusUpdating ? "Updating..." : action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {expanded && (
          <div className="announcement-expanded" onClick={handleExpandedClick}>
            <div className="announcement-expanded-columns">
              <div className="announcement-expanded-column">
                <h5>Announcement</h5>
                <div className="announcement-expanded-row">
                  <span className="announcement-expanded-label">Description</span>
                  <span className="announcement-expanded-value">{descriptionText}</span>
                </div>
                <div className="announcement-expanded-row announcement-expanded-row--stacked">
                  <span className="announcement-expanded-label">Categories</span>
                  <div className="announcement-expanded-value">
                    {isSupplierSpecific ? (
                      <span className="announcement-expanded-chip announcement-expanded-chip--muted">
                        Supplier-specific distribution
                      </span>
                    ) : catsArr.length > 0 ? (
                      <div className="announcement-expanded-chip-grid">
                        {catsArr.map((category) => (
                          <span key={category} className="announcement-expanded-chip">
                            {category}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="announcement-expanded-empty">Uncategorized</span>
                    )}
                    {!isSupplierSpecific && catsArr.length > 0 && (
                      <button
                        type="button"
                        className="announcement-expanded-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          onShowCategories?.(catsArr);
                        }}
                      >
                        View full list
                      </button>
                    )}
                  </div>
                </div>
                <div className="announcement-expanded-row">
                  <span className="announcement-expanded-label">Posted</span>
                  <span className="announcement-expanded-value">{postedDisplay}</span>
                </div>
                <div className="announcement-expanded-row">
                  <span className="announcement-expanded-label">Due</span>
                  <span className="announcement-expanded-value">{attemptDueDisplayShort || endDisplay}</span>
                </div>
                {hasAttachment && (
                  <div className="announcement-expanded-row">
                    <span className="announcement-expanded-label">Attachment</span>
                    <span className="announcement-expanded-value">{attachmentName}</span>
                  </div>
                )}
              </div>
              <div className="announcement-expanded-column">
                <h5>Engagement</h5>
                <div className="announcement-expanded-row">
                  <span className="announcement-expanded-label">Suppliers</span>
                  <span className="announcement-expanded-value">{suppliersSummary}</span>
                  {supplierCount > 0 && (
                    <button
                      type="button"
                      className="announcement-expanded-link"
                      onClick={(event) => {
                        event.stopPropagation();
                        const payload = supplierObjects.length > 0
                          ? supplierObjects
                          : supplierNames.map((name) => ({ name, email: "" }));
                        onShowSuppliers?.(payload);
                      }}
                    >
                      View recipients
                    </button>
                  )}
                </div>
                <div className="announcement-expanded-row">
                  <span className="announcement-expanded-label">Attempt</span>
                  <span className="announcement-expanded-value">{attemptLabel}</span>
                </div>
                <div className="announcement-expanded-row">
                  <span className="announcement-expanded-label">Timeline</span>
                  <span className="announcement-expanded-value">{attemptTimelineDetailed}</span>
                </div>
                {engagementSummary && (
                  <div className="announcement-expanded-row">
                    <span className="announcement-expanded-label">Breakdown</span>
                    <span className="announcement-expanded-value">{engagementSummary}</span>
                  </div>
                )}
                {/* Winner details removed for simplified flow */}
              </div>
            </div>
            <div className="announcement-expanded-actions">
              <button type="button" className="announcement-expanded-action" onClick={handleOpenResponses}>
                View Supplier Responses
              </button>
              <button type="button" className="announcement-expanded-action" onClick={handleOpenHistory}>
                View Status Timeline
              </button>
              <button
                type="button"
                className="announcement-expanded-action"
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdateStatus?.(derivedStatus || "ACTIVE", true);
                }}
              >
                Update Status
              </button>
              <button type="button" className="announcement-expanded-action" onClick={handleNavigateDetailClick}>
                Open Full Detail Page
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const SupplierModal = ({ suppliers, onClose }) => (
    <div className="modal-overlay" onClick={(e) => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal" style={{ maxWidth: "500px" }}>
        <button type="button" className="modal-close-btn" onClick={onClose}>✖</button>
        <h3 style={{ marginBottom: 12 }}>👥 Sent To ({suppliers.length})</h3>
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {suppliers.length === 0 ? (
            <p style={{ color: "#666" }}>No suppliers listed.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {suppliers.map((item, idx) => {
                const name = (item && item.name) || (typeof item === "string" ? item : "");
                const email = (item && item.email) || "";
                return (
                <li key={idx} style={{
                  padding: "8px 12px",
                  margin: "6px 0",
                  background: "#f9fafb",
                  borderRadius: 6,
                  border: "1px solid #e5e7eb"
                }}>
                  <div style={{ fontWeight: 600 }}>{name || "(No company name)"}</div>
                  {email ? <div style={{ color: "#475569", fontSize: "12px" }}>{email}</div> : null}
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  const Dashboard = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [announcements, setAnnouncements] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [postedDate, setPostedDate] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState([]);
    const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
    const [responses, setResponses] = useState([]);
    const [isResponseLoading, setIsResponseLoading] = useState(false);
    const [responseAttempt, setResponseAttempt] = useState(null);
    const [expandedAnnouncementId, setExpandedAnnouncementId] = useState(null);
    const [toast, setToast] = useState({ visible: false, type: "info", message: "" });
    const [categoryMap, setCategoryMap] = useState({});
    const [categoryNameToId, setCategoryNameToId] = useState({});
    const [fileCategoryMap, setFileCategoryMap] = useState({});
    const [categoryHierarchy, setCategoryHierarchy] = useState([]);
    const [supplierOptions, setSupplierOptions] = useState([]);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [modalCategories, setModalCategories] = useState([]);
    const [showSupplierModal, setShowSupplierModal] = useState(false);
    const [modalSuppliers, setModalSuppliers] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalAnnouncements, setTotalAnnouncements] = useState(0);
    const [refreshKey, setRefreshKey] = useState(0);
    const [statusUpdatingId, setStatusUpdatingId] = useState(null);
    const [modalMode, setModalMode] = useState("create");
    const [editingAnnouncement, setEditingAnnouncement] = useState(null);
    const [statusDialog, setStatusDialog] = useState(STATUS_DIALOG_INITIAL);
    const [historyModal, setHistoryModal] = useState(HISTORY_MODAL_INITIAL);
    const [activeView, setActiveView] = useState("announcements");

    const categoryNameIndex = useMemo(() => {
      const idx = {};
      Object.entries(categoryNameToId || {}).forEach(([name, id]) => {
        if (typeof name === "string") {
          idx[name.toUpperCase()] = id;
        }
      });
      return idx;
    }, [categoryNameToId]);

    const supplierIdToName = useMemo(() => {
      const map = {};
      supplierOptions.forEach((sup) => {
        if (sup && sup.id !== undefined && sup.id !== null) {
          map[sup.id] = sup.name || `Supplier ${sup.id}`;
        }
      });
      return map;
    }, [supplierOptions]);

    const dialogSupplierOptions = useMemo(() => [], []);

    const buildAnnouncementFormInitialValues = (record, nameIndex = {}) => {
      if (!record) {
        return null;
      }

      const normalizedSendType = String(record.sendType || "category").toLowerCase() === "supplier" ? "supplier" : "category";

      const parsedCategoryIds = parseIdList(
        record.categoryIds || record.CategoryIDs || record.categoryId || record.CategoryID || []
      );
      let categories = Array.from(
        new Set(parsedCategoryIds.filter((id) => typeof id === "number" && !Number.isNaN(id)))
      );
      if (categories.length === 0) {
        const categoryNames = parseNameList(record.categories || record.categoryDisplay || record.category || "");
        categories = mapCategoryNamesToIds(categoryNames, nameIndex);
      }

      const rawSupplierIds =
        record.supplierIds ||
        record.SupplierIDs ||
        record.supplier_ids ||
        record.suppliersIds ||
        record.suppliers_ids ||
        record.assignedSupplierIds ||
        record.assigned_suppliers ||
        [];
      const suppliers = Array.from(
        new Set(
          parseIdList(rawSupplierIds).filter((id) => typeof id === "number" && !Number.isNaN(id))
        )
      );

      return {
        title: record.title || "",
        description: record.description || "",
        sendType: normalizedSendType,
        categories,
        suppliers,
        end: record.endDateISO || "",
        fileName: record.fileName || "",
        filePath: record.filePath || "",
        notes: "",
      };
    };

    const announcementFormInitialValues = useMemo(
      () => buildAnnouncementFormInitialValues(editingAnnouncement, categoryNameIndex),
      [editingAnnouncement, categoryNameIndex]
    );

    useEffect(() => {
      setCurrentPage(1);
    }, [selectedFilter, searchQuery, postedDate]);

    const openCreateAnnouncementModal = () => {
      setEditingAnnouncement(null);
      setModalMode("create");
      setShowModal(true);
    };

    const closeAnnouncementModal = () => {
      setShowModal(false);
      setModalMode("create");
      setEditingAnnouncement(null);
    };

    const formatAnnouncementRecord = (ann, overrides = {}) => {
      const categoryLookup = overrides.categoryMap ?? categoryMap;
      const fileCategoryLookup = overrides.fileCategoryMap ?? fileCategoryMap;
      const nameIndex = overrides.categoryNameIndex ?? categoryNameIndex ?? {};
      const postedRaw = ann.DatePosted || ann.posted || ann.datePosted;
      const endRaw = ann.EndDate || ann.end || ann.endDate;
      const postedDateObj = postedRaw ? new Date(postedRaw) : null;
      const endDateObj = endRaw ? parseDatePreservingEndOfDay(endRaw) : null;
      const postedStr = postedDateObj
        ? postedDateObj.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "N/A";
      const endStr = endDateObj
        ? endDateObj.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "N/A";
      const endIso = (() => {
        if (!endRaw) return "";
        const parsed = parseDatePreservingEndOfDay(endRaw);
        if (!parsed) {
          return "";
        }
        const adjusted = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
        return adjusted.toISOString().split("T")[0];
      })();
      const postedIso = (() => {
        if (!postedRaw) return null;
        const parsed = new Date(postedRaw);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      })();

      const fileKey = ann.FileID ?? ann.fileId ?? ann.fileID ?? ann.id;
      const fileCats = fileCategoryLookup[fileKey];

      const sendType = ann.sendType || ann.SendType || ann.send_type;

      const parsedCategoryIds = parseIdList(
        ann.categoryIds ??
          ann.CategoryIDs ??
          ann.categoryId ??
          ann.CategoryID ??
          ann.category_ids ??
          ann.CategoryIds ??
          []
      );
      let categoryIds = parsedCategoryIds.filter((id) => typeof id === "number" && !Number.isNaN(id));
      if (categoryIds.length === 0) {
        const categoryNames = parseNameList(
          ann.categories || ann.categoryName || ann.category || (Array.isArray(fileCats) ? fileCats : [])
        );
        categoryIds = mapCategoryNamesToIds(categoryNames, nameIndex);
      }

      const statusRaw =
        ann.status ??
        ann.Status ??
        ann.procurementStatus ??
        ann.procurement_status ??
        null;
      const normalizedStatus = statusRaw ? String(statusRaw).toUpperCase() : null;

      const rawResponseCountParsed = toNullableNumber(
        ann.rawResponseCount ?? ann.rawresponsecount ?? ann.ResponseCount ?? ann.responsecount ?? ann.responses ?? 0
      );
      const respondingSupplierCountParsed = toNullableNumber(
        ann.respondingSupplierCount ?? ann.respondingsuppliercount ?? ann.DistinctResponderCount ?? ann.distinctrespondercount ?? ann.responders ?? null
      );

      const respondingSupplierCount =
        respondingSupplierCountParsed === null
          ? rawResponseCountParsed === null
            ? 0
            : rawResponseCountParsed
          : respondingSupplierCountParsed;

      const rawResponseCount = rawResponseCountParsed === null ? respondingSupplierCount : rawResponseCountParsed;

      const backendExpired = ann.isExpired ?? ann.isexpired;
      const manilaExpired = endDateObj ? isPastInManila(endDateObj) : false;
      let isExpired = false;
      if (typeof backendExpired === "boolean") {
        isExpired = backendExpired;
      } else if (typeof backendExpired === "string") {
        const normalized = backendExpired.trim().toLowerCase();
        isExpired = ["true", "t", "1", "yes"].includes(normalized);
      } else if (typeof backendExpired === "number") {
        isExpired = backendExpired === 1;
      } else {
        isExpired = manilaExpired;
      }

      // If the server says expired but the Manila date has not passed yet, keep it active until end-of-day Manila.
      if (isExpired && !manilaExpired) {
        isExpired = false;
      }

      if (!isExpired && normalizedStatus) {
        if (normalizedStatus === "EXPIRED" || normalizedStatus === "CANCELLED") {
          isExpired = true;
        }
      }

      const derivedStatus = deriveAnnouncementStatus(normalizedStatus, isExpired);
      const isFailedPosting = derivedStatus === "FAILED_POSTING";
      if (isFailedPosting && !isExpired) {
        isExpired = true;
      }

      let displayText = "Uncategorized";
      if (sendType === "supplier") {
        displayText = "Supplier-specific";
      } else if (categoryIds.length > 0) {
        const namesFromIds = categoryIds.map((cid) => categoryLookup[cid]).filter(Boolean);
        if (namesFromIds.length > 0) {
          displayText = namesFromIds.join(", ");
        }
      } else if (ann.categories) {
        displayText = ann.categories;
      } else if (ann.categoryName) {
        displayText = ann.categoryName;
      } else if (fileCats && fileCats.length) {
        displayText = fileCats.join(", ");
      } else {
        displayText =
          categoryLookup[ann.CategoryID] ||
          categoryLookup[ann.categoryId] ||
          ann.category ||
          "Uncategorized";
      }

      let attemptNumber = toNullableNumber(
        ann.attemptNumber ?? ann.attempt_number ?? ann.attemptCount ?? ann.attempt_count ?? ann.repostCount ?? ann.repost_count
      );
      if (!attemptNumber || attemptNumber < 1) {
        attemptNumber = 1;
      }
      const attemptStatus = ann.attemptStatus ?? ann.attempt_status ?? null;
      const procurementStatus = ann.procurementStatus ?? ann.procurement_status ?? normalizedStatus;
      const attemptSentAt = ann.attemptSentAt ?? ann.attempt_sent_at ?? null;
      const attemptDueAt = ann.attemptDueAt ?? ann.attempt_due_at ?? endRaw ?? null;

      const totalSuppliersAssigned =
        toNullableNumber(
          ann.totalSuppliersAssigned ??
            ann.total_suppliers_assigned ??
            ann.totalSuppliers ??
            ann.total_suppliers ??
            ann.TotalSuppliersAssigned
        ) ?? toNullableNumber(ann.assignedSupplierCount ?? ann.assignedsuppliercount);

      const categorySupplierCount = toNullableNumber(
        ann.CategorySupplierCount ?? ann.categorySupplierCount ?? ann.category_supplier_count
      );

      const pendingSupplierCount = toNullableNumber(
        ann.pendingSupplierCount ??
          ann.pendingsuppliercount ??
          ann.pending_supplier_count ??
          ann.PendingCount
      );

      const answeredSupplierCount = toNullableNumber(
        ann.answeredSupplierCount ??
          ann.answered_supplier_count ??
          ann.answeredResponses ??
          ann.answeredresponses ??
          ann.AnsweredCount ??
          ann.completedSupplierCount ??
          ann.completedsuppliercount
      );

      const viewedSupplierCount = toNullableNumber(
        ann.viewedSupplierCount ?? ann.viewed_supplier_count ?? ann.ViewedCount
      );

      const declinedSupplierCount = toNullableNumber(
        ann.declinedSupplierCount ?? ann.declined_supplier_count ?? ann.DeclinedCount
      );

      const fileName =
        ann.fileName ??
        ann.FileName ??
        ann.file?.name ??
        ann.filename ??
        ann.originalFileName ??
        ann.OriginalFileName ??
        "";
      const filePath =
        ann.filePath ??
        ann.FilePath ??
        ann.file_path ??
        "";

      const parsedSupplierIds = parseIdList(
        ann.supplierIds ??
          ann.SupplierIDs ??
          ann.supplier_ids ??
          ann.suppliersIds ??
          ann.suppliers_ids ??
          ann.assignedSupplierIds ??
          ann.assigned_suppliers ??
          ann.SupplierIds ??
          []
      );

      const categorySupplierObjectsRaw = ann.categorySupplierObjects ?? ann.CategorySupplierObjects ?? [];
      const categorySupplierObjects = Array.isArray(categorySupplierObjectsRaw)
        ? categorySupplierObjectsRaw
            .map((obj) => ({
              name: obj?.name || obj?.company_name || obj?.CompanyName || "",
              email: obj?.email || obj?.Email || "",
              supplierId: obj?.supplierId || obj?.supplier_id || obj?.SupplierID || null,
            }))
            .filter((obj) => obj.name || obj.email || obj.supplierId)
        : [];

      const supplierNamesRaw = parseNameList(
        ann.suppliers ?? ann.supplierNames ?? ann.supplier_names ?? ann.Suppliers ?? []
      );
      const supplierObjects = supplierNamesRaw.length > 0
        ? supplierNamesRaw.map((name) => ({ name, email: "" }))
        : categorySupplierObjects;
      const supplierNames = supplierObjects.map((s) => s.name).filter(Boolean);
      const categorySupplierIds = parseIdList(ann.CategorySupplierIds ?? ann.categorySupplierIds ?? []);

      return {
        ...ann,
        posted: postedStr,
        end: endStr,
        endDateISO: endIso,
        postedDateISO: postedIso,
        categoryDisplay: displayText,
        sendType,
        status: normalizedStatus,
        derivedStatus,
        isFailedPosting,
        suppliers: supplierNames,
        responseCount: respondingSupplierCount,
        respondingSupplierCount,
        rawResponseCount,
        hasResponses: respondingSupplierCount > 0,
        isExpired,
        attemptId: ann.attemptId ?? ann.attemptID ?? null,
        procurementId: ann.procurementId ?? ann.procurementID ?? null,
        attemptNumber,
        attemptStatus,
        procurementStatus,
        attemptSentAt,
        attemptDueAt,
        assignedSupplierCount: totalSuppliersAssigned ?? categorySupplierCount ?? null,
        totalSuppliersAssigned: totalSuppliersAssigned ?? categorySupplierCount ?? null,
        pendingSupplierCount,
        answeredSupplierCount,
        completedSupplierCount: answeredSupplierCount,
        viewedSupplierCount,
        declinedSupplierCount,
        awardedSupplierId:
          ann.awardedSupplierId ?? ann.awarded_supplier_id ?? ann.awardedSupplierID ?? ann.AwardedSupplierID ?? null,
        awardedSupplierName:
          ann.awardedSupplierName ?? ann.awarded_supplier_name ?? ann.AwardedSupplierName ?? "",
        awardedAt: ann.awardedAt ?? ann.awarded_at ?? ann.AwardedAt ?? null,
        supplierIds: parsedSupplierIds.length > 0 ? parsedSupplierIds : categorySupplierIds,
        supplierObjects,
        categoryIds: categoryIds,
        fileName,
        filePath,
      };
    };

    useEffect(() => {
      const fetchDashboardData = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
          const announcementParams = { page: 1, limit: PAGE_SIZE };
          const [announcementsRes, statsRes, categoriesRes, fileCatsRes, suppliersRes] = await Promise.all([
            api.get("/api/admin/announcements", { headers: { Authorization: `Bearer ${token}` }, params: announcementParams }),
            api.get("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } }),
            api.get("/api/admin/categories", { headers: { Authorization: `Bearer ${token}` } }),
            api.get("/api/admin/file-categories", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
            api.get("/api/admin/suppliers", { headers: { Authorization: `Bearer ${token}` } }),
          ]);

          const catMap = {};
          const nameToId = {};
          const hierarchy = [];
          
          (categoriesRes.data || []).forEach((parent) => {
            catMap[parent.CategoryID] = parent.CategoryName;
            nameToId[parent.CategoryName] = parent.CategoryID;
            
            // Build hierarchy for filter dropdown
            hierarchy.push({
              id: parent.CategoryID,
              name: parent.CategoryName,
              isParent: true
            });
            
            (parent.Subcategories || []).forEach((child) => {
              catMap[child.CategoryID] = child.CategoryName;
              nameToId[child.CategoryName] = child.CategoryID;
              
              hierarchy.push({
                id: child.CategoryID,
                name: child.CategoryName,
                isParent: false,
                parentName: parent.CategoryName
              });
            });
          });
          
          setCategoryMap(catMap);
          setCategoryNameToId(nameToId);
          setCategoryHierarchy(hierarchy);

          // Build supplier options
          const uniqueSuppliersMap = {};
          (suppliersRes.data || []).forEach((s) => {
            if (!uniqueSuppliersMap[s.id]) {
              uniqueSuppliersMap[s.id] = {
                id: s.id,
                name: s.name,
                email: s.email || s.contactEmail || s.ContactEmail || s.company_email,
                contact: s.contactPerson || s.contact_person || s.contact || s.phone || s.mobile,
              };
            }
          });
          setSupplierOptions(Object.values(uniqueSuppliersMap));

          const fMap = {};
          (fileCatsRes.data || []).forEach((rec) => {
            const fid = rec.FileID ?? rec.fileId ?? rec.fileID;
            const cname = rec.CategoryName ?? catMap[rec.CategoryID ?? rec.categoryId];
            if (!fid) return;
            if (!fMap[fid]) fMap[fid] = [];
            if (cname) fMap[fid].push(cname);
          });
          setFileCategoryMap(fMap);

          const { items: announcementItems, total: totalFromResponse, page: pageFromResponse } = parseAnnouncementsResponse(announcementsRes.data);

          const formattedAnnouncements = (announcementItems || []).map((ann) => formatAnnouncementRecord(ann, {
            categoryMap: catMap,
            fileCategoryMap: fMap,
            categoryNameIndex,
          }));

          setAnnouncements(formattedAnnouncements);
          setTotalAnnouncements(totalFromResponse);
          setCurrentPage(pageFromResponse);

          const s = statsRes.data || {};
          setStats([
            { label: "Total Suppliers", value: s.totalSuppliers || 0, icon: <FaUsers />, bgColor: "#2563eb" },
            { label: "Total Products", value: s.totalProducts || 0, icon: <FaBoxOpen />, bgColor: "#3b82f6" },
            { label: "Active Announcements", value: s.activeAnnouncements || 0, icon: <FaClock />, bgColor: "#60a5fa" },
            { label: "Pending Responses", value: s.pendingResponses || 0, icon: <FaClipboardList />, bgColor: "#1d4ed8" },
            { label: "Answered Responses", value: s.answeredResponses || 0, icon: <FaCheckCircle />, bgColor: "#93c5fd" },
            { label: "Total Categories", value: s.totalCategories || 0, icon: <FaTag />, bgColor: "#3b82f6" },
            { label: "Pending Accounts", value: s.pendingAccounts || 0, icon: <FaUserCheck />, bgColor: "#2563eb" },
          ]);

          setError(null);
        } catch (err) {
          setError("Failed to fetch dashboard data.");
          setToast({ visible: true, type: "error", message: "Failed to load dashboard data" });
          console.error("❌ Fetch error:", err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchDashboardData();
    }, [token]);

    useEffect(() => {
      const run = async () => {
        if (!token) return;
        try {
          const params = { page: currentPage, limit: PAGE_SIZE };
          if (searchQuery.trim()) params.search = searchQuery.trim();
          
          if (selectedFilter && selectedFilter !== "All") {
            if (selectedFilter.startsWith("supplierId:")) {
              const supplierIdStr = selectedFilter.replace("supplierId:", "");
              const sid = parseInt(supplierIdStr, 10);
              if (!Number.isNaN(sid)) params.supplierId = sid;
            } else if (selectedFilter.startsWith("supplier:")) {
              // Backward compatibility if any existing state persists
              const supplierName = selectedFilter.replace("supplier:", "");
              params.supplierName = supplierName;
            } else if (selectedFilter.startsWith("category:")) {
              const categoryName = selectedFilter.replace("category:", "");
              const cid = categoryNameToId[categoryName];
              if (cid) params.categoryId = cid;
            }
          }
          
          if (postedDate) {
            params.from = postedDate;
            params.to = postedDate;
          }

          const announcementsRes = await api.get("/api/admin/announcements", {
            headers: { Authorization: `Bearer ${token}` },
            params,
          });

          const { items, total, page } = parseAnnouncementsResponse(announcementsRes.data);
          const formatted = (items || []).map((ann) =>
            formatAnnouncementRecord(ann, { categoryNameIndex })
          );
          setAnnouncements(formatted);
          setTotalAnnouncements(total);
          setCurrentPage(page);
        } catch (e) {
          console.warn("Failed to fetch filtered announcements", e);
        }
      };
      run();
    }, [selectedFilter, searchQuery, postedDate, token, categoryNameToId, categoryMap, fileCategoryMap, categoryNameIndex, currentPage, refreshKey]);

    const handlePostAnnouncement = async (formData) => {
      const data = new FormData();
      data.append("title", formData.title);
      data.append("description", formData.description);
      if (formData.file) {
        data.append("file", formData.file);
      }
      if (formData.end) {
        data.append("end", formData.end);
      }

      if (formData.categories && formData.categories.length > 0) {
        const uniqueCategories = Array.from(new Set(formData.categories));
        data.append("categories", JSON.stringify(uniqueCategories));
      }

      if (formData.sendType === "supplier") {
        const supplierIds = Array.from(new Set(formData.suppliers.filter((id) => id !== "all")));
        data.append("suppliers", JSON.stringify(supplierIds));
        data.append("sendType", "supplier");
      } else if (formData.sendType === "category") {
        data.append("sendType", "category");
      }

      try {
        await api.post("/api/admin/announcements", data, {
          headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` },
        });
        setToast({ visible: true, type: "success", message: "Announcement posted successfully" });
        setCurrentPage(1);
        setRefreshKey((key) => key + 1);
      } catch (err) {
        console.error("❌ Failed to post announcement:", err);
        const errorMsg = err.response?.data?.message || "An error occurred.";
        setToast({ visible: true, type: "error", message: `Failed to post announcement: ${errorMsg}` });
        throw err;
      }
    };

    const handleEditAnnouncement = async (formData) => {
      if (!editingAnnouncement) {
        return;
      }

      const data = new FormData();
      data.append("title", formData.title);
      data.append("description", formData.description);
      if (formData.end) {
        data.append("end", formData.end);
      }

      if (Array.isArray(formData.categories) && formData.categories.length > 0) {
        const uniqueCategories = Array.from(new Set(formData.categories));
        data.append("categories", JSON.stringify(uniqueCategories));
      }

      if (formData.sendType === "supplier") {
        const supplierIds = Array.isArray(formData.suppliers)
          ? Array.from(new Set(formData.suppliers.filter((id) => id !== "all")))
          : [];
        data.append("suppliers", JSON.stringify(supplierIds));
        data.append("sendType", "supplier");
      } else {
        data.append("sendType", "category");
      }

      if (formData.file) {
        data.append("file", formData.file);
      }

      if (typeof formData.notes === "string" && formData.notes.trim().length > 0) {
        data.append("notes", formData.notes.trim());
      }

      try {
        const response = await api.put(
          `/api/admin/announcements/${editingAnnouncement.id}`,
          data,
          {
            headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` },
          }
        );

        const updated = response.data?.announcement;
        if (updated) {
          const formatted = formatAnnouncementRecord(updated, {
            categoryMap,
            fileCategoryMap,
            categoryNameIndex,
          });
          setAnnouncements((prev) =>
            prev.map((item) => {
              if (item.id !== formatted.id) {
                return item;
              }

              const previousAttempt = toNullableNumber(item.attemptNumber) || 1;
              const formattedAttempt = toNullableNumber(formatted.attemptNumber);
              const nextAttemptNumber = formattedAttempt && formattedAttempt >= previousAttempt
                ? formattedAttempt
                : previousAttempt + 1;

              return {
                ...formatted,
                attemptNumber: nextAttemptNumber,
              };
            })
          );
        }

        setToast({ visible: true, type: "success", message: "Announcement updated successfully" });
        setRefreshKey((key) => key + 1);
      } catch (err) {
        console.error("❌ Failed to update announcement:", err);
        const errorMsg = err.response?.data?.message || "Unable to update announcement.";
        setToast({ visible: true, type: "error", message: errorMsg });
        throw err;
      }
    };

    const handleAnnouncementSubmit = async (formData) => {
      try {
        if (modalMode === "edit" && editingAnnouncement) {
          await handleEditAnnouncement(formData);
        } else {
          await handlePostAnnouncement(formData);
        }
        closeAnnouncementModal();
      } catch (err) {
        console.warn("Announcement submission failed", err);
      }
    };

    const fetchAnnouncementResponses = async (announcement, attemptNumber = null) => {
      if (!announcement || !announcement.id) return;
      setIsResponseLoading(true);
      try {
        const params = {};
        if (announcement.attemptId) {
          params.attemptId = announcement.attemptId;
        }
        if (attemptNumber) {
          params.attemptNumber = attemptNumber;
        } else if (announcement.attemptNumber) {
          params.attemptNumber = announcement.attemptNumber;
        }
        const response = await api.get(`/api/admin/announcements/${announcement.id}/responses`, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });
        setResponses(response.data);
        setResponseAttempt(attemptNumber || announcement.attemptNumber || 1);
      } catch (error) {
        console.error("❌ Failed to fetch responses:", error);
        setToast({ visible: true, type: "warning", message: "Could not load supplier responses" });
      } finally {
        setIsResponseLoading(false);
      }
    };

    const handleOpenResponseModal = async (announcement) => {
      setSelectedAnnouncement(announcement);
      setHistoryModal(HISTORY_MODAL_INITIAL);
      const initialAttempt = announcement?.attemptNumber || 1;
      setResponseAttempt(initialAttempt);
      await fetchAnnouncementResponses(announcement, initialAttempt);
    };

    const handleSelectResponseAttempt = async (attemptNumber) => {
      if (!selectedAnnouncement || isResponseLoading) return;
      setResponseAttempt(attemptNumber);
      await fetchAnnouncementResponses(selectedAnnouncement, attemptNumber);
    };

    const handleToggleAnnouncementExpand = (announcement) => {
      if (!announcement) {
        return;
      }
      setExpandedAnnouncementId((prev) => (prev === announcement.id ? null : announcement.id));
    };

    const handleNavigateToAnnouncementDetail = (announcement) => {
      if (!announcement) {
        return;
      }
      navigate(`/admin/announcements/${announcement.id}`, {
        state: { announcement },
      });
    };

    const handleShowStatusHistory = async (announcement) => {
      if (!token || !announcement?.id) {
        return;
      }

      setHistoryModal({
        visible: true,
        announcement,
        records: [],
        loading: true,
        error: null,
      });

      try {
        const response = await api.get(
          `/api/admin/announcements/${announcement.id}/status-history`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const items = Array.isArray(response.data) ? response.data : [];
        setHistoryModal((prev) => ({
          ...prev,
          records: items,
          loading: false,
          error: null,
        }));
      } catch (err) {
        console.error("❌ Failed to load status history:", err);
        const errorMsg = err.response?.data?.message || "Failed to load status history.";
        setHistoryModal((prev) => ({
          ...prev,
          loading: false,
          error: errorMsg,
        }));
        setToast({ visible: true, type: "error", message: errorMsg });
      }
    };

    const closeHistoryModal = () => {
      setHistoryModal((prev) => ({ ...prev, visible: false }));
    };

    const handleShowCategories = (categories) => {
      setModalCategories(categories);
      setShowCategoryModal(true);
    };

    const handleShowSuppliers = (suppliers) => {
      setModalSuppliers(suppliers);
      setShowSupplierModal(true);
    };

    const handleRepostAnnouncement = async (announcement) => {
      if (!announcement || !announcement.id) {
        return;
      }

      try {
        // Fetch full detail so categories/suppliers are pre-filled on repost
        const { data } = await api.get(`/api/admin/announcements/${announcement.id}/detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const detail = data?.announcement || announcement;
        const formatted = formatAnnouncementRecord(detail, {
          categoryMap,
          fileCategoryMap,
          categoryNameIndex,
        });

        setEditingAnnouncement(formatted);
        setModalMode("edit");
        setShowModal(true);
      } catch (err) {
        console.error("Failed to load announcement detail for repost:", err);
        setToast({
          visible: true,
          type: "error",
          message: "Could not load announcement details for repost. Please try again.",
        });
      }
    };

    const openStatusDialog = (announcement, statusUpper, allowStatusChoice = false) => {
      if (!announcement || !statusUpper) {
        return;
      }

      setStatusDialog({
        ...STATUS_DIALOG_INITIAL,
        visible: true,
        status: statusUpper,
        announcement,
        message:
          STATUS_CONFIRMATION_MESSAGES[statusUpper] ||
          `Update status to ${formatStatusLabel(statusUpper)}?`,
        statusOptions: allowStatusChoice ? STATUS_CHOICES : [],
      });
    };

    const closeStatusDialog = () => {
      setStatusDialog(STATUS_DIALOG_INITIAL);
    };

    const handleStatusDialogSubmit = async () => {
      if (!statusDialog.visible || !statusDialog.announcement || !statusDialog.status) {
        return;
      }

      const announcement = statusDialog.announcement;
      const statusUpper = statusDialog.status;
      const notesTrimmed = statusDialog.notes.trim();
      const requiresNotes = false;
      const requiresStatusChoice = Array.isArray(statusDialog.statusOptions) && statusDialog.statusOptions.length > 0;

      if (requiresNotes && notesTrimmed.length === 0) {
        setStatusDialog((prev) => ({ ...prev, error: "Please provide notes for this action." }));
        return;
      }

      if (requiresStatusChoice && !statusUpper) {
        setStatusDialog((prev) => ({ ...prev, error: "Please select a status." }));
        return;
      }

      try {
        setStatusDialog((prev) => ({ ...prev, submitting: true, error: null }));
        setStatusUpdatingId(announcement.id);

        const payload = { status: statusUpper };
        if (notesTrimmed.length > 0) {
          payload.notes = notesTrimmed;
        }

        const response = await api.patch(
          `/api/admin/announcements/${announcement.id}/status`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const updatedStatus = response.data?.status || statusUpper;
        const updatedSupplierId = undefined;
        const updatedSupplierName = "";

        setAnnouncements((prev) =>
          prev.map((item) => {
            if (item.id !== announcement.id) {
              return item;
            }
            const normalizedUpdatedStatus = normalizeStatus(updatedStatus);
            const isCancelled = normalizedUpdatedStatus === "CANCELLED";
            const nextIsExpired = (() => {
              if (normalizedUpdatedStatus === "ACTIVE") {
                return false;
              }
              if (normalizedUpdatedStatus === "EXPIRED") {
                return true;
              }
              if (normalizedUpdatedStatus === "FAILED_POSTING") {
                return true;
              }
              return item.isExpired;
            })();
            const nextDerivedStatus = deriveAnnouncementStatus(normalizedUpdatedStatus, nextIsExpired);
            const nextIsFailedPosting = nextDerivedStatus === "FAILED_POSTING";
            return {
              ...item,
              status: normalizedUpdatedStatus,
              derivedStatus: nextDerivedStatus,
              isFailedPosting: nextIsFailedPosting,
              isExpired: isCancelled || nextIsExpired,
              awardedSupplierId: null,
              awardedSupplierName: "",
            };
          })
        );

        setToast({
          visible: true,
          type: "success",
          message: `Status updated to ${formatStatusLabel(normalizeStatus(updatedStatus))}.`,
        });

        setRefreshKey((key) => key + 1);
        closeStatusDialog();
      } catch (err) {
        console.error("❌ Failed to update status:", err);
        const errorMsg = err.response?.data?.message || "Unable to update status.";
        setStatusDialog((prev) => ({ ...prev, error: errorMsg }));
        setToast({ visible: true, type: "error", message: errorMsg });
      } finally {
        setStatusUpdatingId(null);
        setStatusDialog((prev) => (prev.visible ? { ...prev, submitting: false } : prev));
      }
    };

    const handleUpdateAnnouncementStatus = (announcement, nextStatus, allowStatusChoice = false) => {
      if (!token || !announcement?.id || !nextStatus) {
        return;
      }

      const statusUpper = String(nextStatus).toUpperCase();
      const rawStatus = normalizeStatus(
        announcement.status ??
          announcement.derivedStatus ??
          announcement.procurementStatus ??
          announcement.procurement_status ??
          ""
      );
      const currentIsExpired = Boolean(announcement.isExpired ?? announcement.isexpired);
      const currentIsFailedPosting =
        typeof announcement.isFailedPosting === "boolean"
          ? announcement.isFailedPosting
          : isFailedPostingStatus(rawStatus, currentIsExpired);

      if (statusUpper === "ACTIVE" && !allowStatusChoice) {
        if (!currentIsFailedPosting) {
          setToast({
            visible: true,
            type: "info",
            message: "Only failed postings can be reposted.",
          });
          return;
        }
        handleRepostAnnouncement(announcement);
        return;
      }

      if (allowStatusChoice) {
        openStatusDialog(announcement, statusUpper, true);
        return;
      }

      openStatusDialog(announcement, statusUpper, false);
    };

    const totalPages = Math.max(1, Math.ceil((totalAnnouncements || 0) / PAGE_SIZE));
    const startItemIndex = totalAnnouncements === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const endItemIndex = totalAnnouncements === 0 ? 0 : Math.min(totalAnnouncements, currentPage * PAGE_SIZE);
    const pageSummary = totalAnnouncements === 0
      ? "No announcements to display"
      : `Showing ${startItemIndex}-${endItemIndex} of ${totalAnnouncements}`;
    const showPagination = totalPages > 1;

    const statusDialogRequiresNotes = false;
    const statusDialogRequiresStatusChoice = Array.isArray(statusDialog.statusOptions) && statusDialog.statusOptions.length > 0;
    const statusDialogSubmitDisabled =
      statusDialog.submitting ||
      (statusDialogRequiresStatusChoice && !statusDialog.status);
    const statusDialogStatusLabel = statusDialog.status
      ? formatStatusLabel(statusDialog.status)
      : "Status";
    const statusDialogConfirmLabel = statusDialog.submitting ? "Updating…" : "Confirm";

    return (
      <div className="dashboard-container">
        <Toast type={toast.type} message={toast.message} visible={toast.visible} onClose={() => setToast({ ...toast, visible: false })} duration={3000} />
        <div className="dashboard-header">
          <span className="dashboard-header-tagline">MSSS Admin Console</span>
          <h2>Dashboard Overview</h2>
          <p>Monitor procurement activities, supplier engagement, and announcement status at a glance.</p>
        </div>

        <StatsSection stats={stats} />

        {isLoading && (
          <div className="dashboard-loading">
            <div className="loading-spinner" aria-hidden />
            <p>Loading dashboard data...</p>
          </div>
        )}
        {error && <p className="error-message">{error}</p>}

        <div className="collapsible-section">
          <div className="collapsible-header">
            <h4>{activeView === 'announcements' ? `📢 Recent Procurement Announcements (${announcements.length})` : '📥 Purchase Requests'}</h4>
            <div className="view-toggle">
              <button
                type="button"
                className={`view-toggle-btn ${activeView === 'announcements' ? 'active' : ''}`}
                onClick={() => setActiveView('announcements')}
              >
                Announcements
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${activeView === 'requests' ? 'active' : ''}`}
                onClick={() => setActiveView('requests')}
              >
                Purchase Requests
              </button>
            </div>
          </div>
          <div className="collapsible-content">
            {activeView === 'announcements' && (
              <div className="dashboard-filters">
                <div className="filters-left">
                  <button className="post-btn" onClick={openCreateAnnouncementModal}>
                    + Post Announcement
                  </button>
                </div>
                <div className="filters-right">
                  <input
                    type="text"
                    placeholder="Search title or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="filter-input"
                  />

                  <select
                    value={selectedFilter}
                    onChange={(e) => setSelectedFilter(e.target.value)}
                    className="filter-select"
                    style={{ minWidth: "200px" }}
                  >
                    <option value="All">📋 All Announcements</option>

                    <optgroup label="📁 BY CATEGORY">
                      {categoryHierarchy.map((cat) => (
                        <option
                          key={`category:${cat.name}`}
                          value={`category:${cat.name}`}
                          style={{ paddingLeft: cat.isParent ? "5px" : "20px" }}
                        >
                          {cat.isParent ? `${cat.name}` : `└─ ${cat.name}`}
                        </option>
                      ))}
                    </optgroup>

                    <optgroup label="👥 BY SUPPLIER">
                      {supplierOptions.map((sup) => (
                        <option key={`supplierId:${sup.id}`} value={`supplierId:${sup.id}`}>
                          {sup.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  <input
                    type="date"
                    value={postedDate}
                    onChange={(e) => setPostedDate(e.target.value)}
                    className="filter-date"
                    title="Filter by posted date"
                  />

                  {(searchQuery || selectedFilter !== "All" || postedDate) && (
                    <button
                      type="button"
                      className="see-more-btn"
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedFilter("All");
                        setPostedDate("");
                      }}
                      title="Clear filters"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
            {activeView === 'announcements' ? (
              isLoading ? (
                <div className="announcements-loading">
                  <div className="loading-spinner" aria-hidden />
                  <p>Loading announcements...</p>
                </div>
              ) : announcements.length === 0 ? (
                <p>No announcements found.</p>
              ) : (
                <>
                  {showPagination && (
                    <div className="pagination-wrapper top">
                      <div className="pagination-summary">{pageSummary}</div>
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        showPreview
                        previewCount={7}
                      />
                    </div>
                  )}

                  <div className="announcements-container">
                    {announcements.map((ann) => (
                      <AnnouncementCard
                        key={ann.id}
                        announcement={ann}
                        onShowCategories={handleShowCategories}
                        onShowSuppliers={handleShowSuppliers}
                        onToggleExpand={() => handleToggleAnnouncementExpand(ann)}
                        expanded={expandedAnnouncementId === ann.id}
                        onOpenResponses={() => handleOpenResponseModal(ann)}
                        onOpenHistory={() => handleShowStatusHistory(ann)}
                        onNavigateDetail={() => handleNavigateToAnnouncementDetail(ann)}
                        onUpdateStatus={(nextStatus, allowChoice) => handleUpdateAnnouncementStatus(ann, nextStatus, allowChoice)}
                        onRepost={() => handleRepostAnnouncement(ann)}
                        isStatusUpdating={statusUpdatingId === ann.id}
                      />
                    ))}
                  </div>

                  {showPagination && (
                    <div className="pagination-wrapper">
                      <div className="pagination-summary">{pageSummary}</div>
                      <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={setCurrentPage}
                        showPreview
                        previewCount={7}
                      />
                    </div>
                  )}
                </>
              )
            ) : (
              <BuyerRequestsSection token={token} toast={toast} setToast={setToast} noWrapper={true} />
            )}
          </div>
        </div>

        {showModal && (
          <div
            className="modal-overlay"
            onClick={(e) =>
              (e.target.classList.contains("modal-overlay") || e.target.classList.contains("modal-close-btn")) &&
              closeAnnouncementModal()
            }
          >
            <div className="modal">
              <button type="button" className="modal-close-btn" onClick={closeAnnouncementModal}>
                ✖
              </button>
              <AnnouncementForm
                onSubmit={handleAnnouncementSubmit}
                onCancel={closeAnnouncementModal}
                initialValues={announcementFormInitialValues}
                mode={modalMode}
              />
            </div>
          </div>
        )}

        {selectedAnnouncement && (
          <ResponseModal
            announcement={selectedAnnouncement}
            responses={responses}
            isLoading={isResponseLoading}
            attemptNumber={responseAttempt}
            maxAttempts={selectedAnnouncement?.attemptNumber || 1}
            onSelectAttempt={handleSelectResponseAttempt}
            onClose={() => {
              setSelectedAnnouncement(null);
              setHistoryModal(HISTORY_MODAL_INITIAL);
              setResponseAttempt(null);
            }}
          />
        )}

        {/* Buyer purchase requests are accessible via the view toggle above. */}

        <StatusHistoryModal
          visible={historyModal.visible}
          records={historyModal.records}
          announcement={historyModal.announcement}
          loading={historyModal.loading}
          error={historyModal.error}
          onClose={closeHistoryModal}
        />

        {showCategoryModal && (
          <CategoryModal categories={modalCategories} onClose={() => setShowCategoryModal(false)} />
        )}

        {showSupplierModal && (
          <SupplierModal suppliers={modalSuppliers} onClose={() => setShowSupplierModal(false)} />
        )}

        <StatusUpdateModal
          visible={statusDialog.visible && Boolean(statusDialog.announcement)}
          title={`Confirm ${statusDialogStatusLabel} Action`}
          message={statusDialog.message}
          statusOptions={statusDialog.statusOptions}
          statusValue={statusDialog.status}
          onStatusChange={(value) =>
            setStatusDialog((prev) => ({
              ...prev,
              status: value,
              error: null,
            }))
          }
          supplierOptions={dialogSupplierOptions}
          supplierRequired={false}
          supplierValue={""}
          onSupplierChange={() => {}}
          supplierSearchValue=""
          onSupplierSearchChange={() => {}}
          manualWinnerName=""
          manualWinnerEmail=""
          manualWinnerContact=""
          onManualWinnerChange={() => {}}
          notesValue={statusDialog.notes}
          onNotesChange={(value) =>
            setStatusDialog((prev) => ({
              ...prev,
              notes: value,
              error: null,
            }))
          }
          notesRequired={statusDialogRequiresNotes}
          submitting={statusDialog.submitting}
          error={statusDialog.error}
          onCancel={closeStatusDialog}
          onConfirm={handleStatusDialogSubmit}
          confirmLabel={statusDialogConfirmLabel}
          disableConfirm={statusDialogSubmitDisabled}
        />
      </div>
    );
  };

  export default Dashboard;