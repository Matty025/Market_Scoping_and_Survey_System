import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import StatusHistoryModal from "../../components/StatusHistoryModal";
import ResponseModal from "../../components/ResponseModal";
import Toast from "../../components/Toast";
import "./AnnouncementDetail.css";

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
  AWARDED: "#f59e0b",
};

const HISTORY_MODAL_INITIAL = {
  visible: false,
  announcement: null,
  records: [],
  loading: false,
  error: null,
};

const normalizeCategoryKey = (value) =>
  String(value || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/\bAND\b/g, " ")
    .replace(/[^A-Z0-9]/g, "")
    .trim();

const CATEGORY_GROUP_DEFINITIONS = {
  GOODS: [
    "OFFICE SUPPLIES & DEVICES",
    "IT EQUIPMENT & PERIPHERALS",
    "EDUCATIONAL & INSTRUCTIONAL MATERIALS",
    "FURNITURE & FIXTURES",
    "SPORTS & PHYSICAL EDUCATION EQUIPMENT",
    "LABORATORY EQUIPMENT & SUPPLIES",
    "ELECTRICAL & ELECTRONIC SUPPLIES",
    "CLEANING & JANITORIAL SUPPLIES",
    "MEDICAL & FIRST AID SUPPLIES",
    "VEHICLES, TOOLS & MACHINERY",
    "PRINTING & REPRODUCTION SERVICES",
    "UNIFORMS, APPAREL & FABRICS",
    "FOOD & CATERING SUPPLIES",
    "GENERAL SUPPORT SERVICES",
  ],
  INFRASTRUCTURE_PROJECTS: [
    "SCHOOL BUILDING CONSTRUCTION",
    "SCHOOL BUILDING REHABILITATION",
    "WATER SUPPLY & SANITATION SYSTEMS",
    "ELECTRICAL & POWER SYSTEMS",
    "SITE DEVELOPMENT & LANDSCAPING",
    "ROOFING AND PAINTING WORKS",
    "MINOR REPAIRS & MAINTENANCE WORK",
  ],
  CONSULTING_SERVICES: [
    "ARCHITECTURAL & ENGINEERING DESIGN",
    "FEASIBILITY & PROJECT STUDIES",
    "CONSTRUCTION SUPERVISION",
    "ICT SYSTEM DEVELOPMENT",
    "RESEARCH & EVALUATION STUDIES",
  ],
};

const CATEGORY_GROUP_LABELS = {
  GOODS: "Goods",
  INFRASTRUCTURE_PROJECTS: "Infrastructure Projects",
  CONSULTING_SERVICES: "Consulting Services",
  OTHER: "Other Categories",
};

const CATEGORY_LOOKUP = (() => {
  const map = new Map();
  Object.keys(CATEGORY_GROUP_DEFINITIONS).forEach((groupKey) => {
    const plainLabel = groupKey.replace(/_/g, " ");
    map.set(normalizeCategoryKey(groupKey), groupKey);
    map.set(normalizeCategoryKey(plainLabel), groupKey);
  });
  Object.entries(CATEGORY_GROUP_DEFINITIONS).forEach(([groupKey, items]) => {
    items.forEach((item) => {
      const normalized = normalizeCategoryKey(item);
      if (normalized.length > 0) {
        map.set(normalized, groupKey);
      }
    });
  });
  return map;
})();

const getStatusBadgeColor = (status) => {
  if (!status) return "#4b5563";
  const normalized = String(status).toUpperCase();
  return STATUS_BADGE_COLORS[normalized] || "#4b5563";
};

const formatStatusLabel = (status) => {
  if (!status) return "Unknown";
  const normalized = String(status).toUpperCase();
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

const formatShortDate = (value, options = { month: "short", day: "numeric", year: "numeric" }) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("en-US", options);
};

const formatAnnouncementRecord = (ann) => {
  if (!ann) return null;

  const postedRaw =
    ann.postedDateISO ||
    ann.postedDateIso ||
    ann.postedDate ||
    ann.DatePosted ||
    ann.posted ||
    null;
  const endRaw = ann.endDateISO || ann.EndDate || ann.end || null;

  const postedDateObj = postedRaw ? new Date(postedRaw) : null;
  const endDateObj = endRaw ? new Date(endRaw) : null;

  const postedStr = postedDateObj
    ? postedDateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ann.posted || "N/A";

  const endStr = endDateObj
    ? endDateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : ann.end || "N/A";

  const postedIso = postedDateObj && !Number.isNaN(postedDateObj.getTime())
    ? postedDateObj.toISOString()
    : ann.postedDateISO || null;

  const endIso = endDateObj && !Number.isNaN(endDateObj.getTime())
    ? endDateObj.toISOString().split("T")[0]
    : ann.endDateISO || "";

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

  const attemptNumber = toNullableNumber(
    ann.attemptNumber ?? ann.attempt_number ?? ann.attemptCount ?? ann.attempt_count ?? ann.repostCount ?? ann.repost_count
  ) || 1;

  const normalizedStatus = ann.status ? String(ann.status).toUpperCase() : null;
  const procurementStatus = ann.procurementStatus || ann.procurement_status || normalizedStatus;

  const suppliersArray = Array.isArray(ann.suppliers) ? ann.suppliers : [];
  const supplierIdsArray = Array.isArray(ann.supplierIds) ? ann.supplierIds : [];

  const toNumber = (value) => (typeof value === "number" ? value : toNullableNumber(value));

  return {
    ...ann,
    id: ann.id ?? ann.FileID ?? ann.fileId ?? ann.fileID,
    title: ann.title ?? ann.Title ?? ann.name ?? "Untitled",
    description: ann.description ?? ann.Description ?? "No description provided yet.",
    posted: postedStr,
    end: endStr,
    postedDateISO: postedIso,
    endDateISO: endIso,
    sendType: ann.sendType || ann.SendType || ann.send_type || "category",
    status: normalizedStatus,
    procurementStatus,
    attemptNumber,
    attemptStatus: ann.attemptStatus ?? ann.attempt_status ?? procurementStatus,
    attemptSentAt: ann.attemptSentAt ?? ann.attempt_sent_at ?? null,
    attemptDueAt: ann.attemptDueAt ?? ann.attempt_due_at ?? endRaw ?? null,
    suppliers: suppliersArray,
    supplierIds: supplierIdsArray,
    categories: ann.categories || ann.categoryDisplay || ann.category || "",
    categoryIds: Array.isArray(ann.categoryIds) ? ann.categoryIds : [],
    responseCount: respondingSupplierCount,
    respondingSupplierCount,
    rawResponseCount,
    hasResponses: respondingSupplierCount > 0,
    totalSuppliersAssigned: toNumber(
      ann.totalSuppliersAssigned ??
        ann.total_suppliers_assigned ??
        ann.totalSuppliers ??
        ann.total_suppliers ??
        ann.TotalSuppliersAssigned
    ),
    pendingSupplierCount: toNumber(
      ann.pendingSupplierCount ??
        ann.pendingsuppliercount ??
        ann.pending_supplier_count ??
        ann.PendingCount
    ),
    answeredSupplierCount: toNumber(
      ann.answeredSupplierCount ??
        ann.answered_supplier_count ??
        ann.answeredResponses ??
        ann.answeredresponses ??
        ann.AnsweredCount ??
        ann.completedSupplierCount ??
        ann.completedsuppliercount
    ),
    viewedSupplierCount: toNumber(ann.viewedSupplierCount ?? ann.viewed_supplier_count ?? ann.ViewedCount),
    declinedSupplierCount: toNumber(ann.declinedSupplierCount ?? ann.declined_supplier_count ?? ann.DeclinedCount),
    awardedSupplierName:
      ann.awardedSupplierName ?? ann.awarded_supplier_name ?? ann.AwardedSupplierName ?? "",
    awardedSupplierId:
      ann.awardedSupplierId ?? ann.awarded_supplier_id ?? ann.awardedSupplierID ?? ann.AwardedSupplierID ?? null,
    fileName:
      ann.fileName ??
      ann.FileName ??
      ann.file?.name ??
      ann.filename ??
      ann.originalFileName ??
      ann.OriginalFileName ??
      "",
    filePath: ann.filePath ?? ann.FilePath ?? ann.file_path ?? "",
    isExpired: Boolean(ann.isExpired ?? ann.isexpired ?? false),
  };
};

const AnnouncementDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();

  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });
  const [announcement, setAnnouncement] = useState(() => {
    if (location.state?.announcement) {
      return location.state.announcement;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState(!announcement);
  const [error, setError] = useState(null);
  const [historyModal, setHistoryModal] = useState(HISTORY_MODAL_INITIAL);
  const [responses, setResponses] = useState([]);
  const [isResponseLoading, setIsResponseLoading] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  const normalizedAnnouncement = useMemo(() => formatAnnouncementRecord(announcement), [announcement]);

  useEffect(() => {
    if (!token || !id) {
      return;
    }

    const fetchDetail = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await axios.get(`http://localhost:3001/api/admin/announcements/${id}/detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.data?.announcement || response.data) {
          const record = response.data.announcement || response.data;
          setAnnouncement(record);
        } else {
          setError("Announcement not found.");
        }
      } catch (err) {
        console.error("Failed to fetch announcement detail:", err);
        const statusCode = err.response?.status;
        if (statusCode === 404 && location.state?.announcement) {
          // Fallback to the data passed via navigation when API endpoint is unavailable.
          setError(null);
          setToast({
            visible: true,
            type: "warning",
            message: "Live detail endpoint not found; showing cached dashboard data instead.",
          });
        } else {
          const message = err.response?.data?.message || "Failed to load announcement details.";
          setError(message);
          setToast({ visible: true, type: "error", message });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetail();
  }, [token, id, location.state?.announcement]);

  const handleCloseToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const handleShowStatusHistory = async (targetAnnouncement = normalizedAnnouncement) => {
    if (!token || !targetAnnouncement?.id) {
      return;
    }

    setHistoryModal({
      visible: true,
      announcement: targetAnnouncement,
      records: [],
      loading: true,
      error: null,
    });

    try {
      const response = await axios.get(
        `http://localhost:3001/api/admin/announcements/${targetAnnouncement.id}/status-history`,
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
      const message = err.response?.data?.message || "Failed to load status history.";
      setHistoryModal((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      setToast({ visible: true, type: "error", message });
    }
  };

  const handleOpenResponses = async () => {
    const targetAnnouncement = normalizedAnnouncement;
    if (!token || !targetAnnouncement) {
      return;
    }
    setSelectedAnnouncement(targetAnnouncement);
    setIsResponseLoading(true);
    try {
      const params = {};
      if (targetAnnouncement.attemptId) {
        params.attemptId = targetAnnouncement.attemptId;
      }
      if (targetAnnouncement.attemptNumber) {
        params.attemptNumber = targetAnnouncement.attemptNumber;
      }
      const response = await axios.get(
        `http://localhost:3001/api/admin/announcements/${targetAnnouncement.id}/responses`,
        { headers: { Authorization: `Bearer ${token}` }, params }
      );
      setResponses(response.data || []);
    } catch (err) {
      console.error("❌ Failed to fetch responses:", err);
      const message = err.response?.data?.message || "Could not load supplier responses.";
      setToast({ visible: true, type: "warning", message });
    } finally {
      setIsResponseLoading(false);
    }
  };

  const closeHistoryModal = () => {
    setHistoryModal((prev) => ({ ...prev, visible: false }));
  };

  const closeResponseModal = () => {
    setSelectedAnnouncement(null);
  };

  const detail = normalizedAnnouncement;
  const respondingSuppliersCount = detail?.respondingSupplierCount ?? detail?.responseCount ?? 0;
  const rawResponseTotalCount = detail?.rawResponseCount ?? respondingSuppliersCount;
  const categoriesList = useMemo(() => {
    if (!detail) {
      return [];
    }
    const raw = Array.isArray(detail.categoryDisplay)
      ? detail.categoryDisplay
      : detail.categoryDisplay || detail.categories;

    const values = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? raw.split(",")
        : [];

    const unique = new Set();
    const cleaned = [];
    values.forEach((item) => {
      const normalized = String(item || "")
        .replace(/\s+/g, " ")
        .trim();
      if (normalized.length === 0) {
        return;
      }
      if (normalized.toUpperCase() === "UNCATEGORIZED") {
        return;
      }
      const uniqueKey = normalizeCategoryKey(normalized);
      if (!unique.has(uniqueKey)) {
        unique.add(uniqueKey);
        cleaned.push(normalized);
      }
    });
    return cleaned;
  }, [detail]);

  const groupedCategories = useMemo(() => {
    if (categoriesList.length === 0) {
      return [];
    }
    const buckets = {
      GOODS: [],
      INFRASTRUCTURE_PROJECTS: [],
      CONSULTING_SERVICES: [],
      OTHER: [],
    };

    categoriesList.forEach((category) => {
      const key = normalizeCategoryKey(category);
      const groupKey = CATEGORY_LOOKUP.get(key) || "OTHER";
      buckets[groupKey].push(category);
    });

    return Object.entries(buckets)
      .filter(([, items]) => items.length > 0)
      .map(([groupKey, items]) => ({
        key: groupKey,
        label: CATEGORY_GROUP_LABELS[groupKey] || CATEGORY_GROUP_LABELS.OTHER,
        items: items.slice().sort((a, b) => a.localeCompare(b)),
      }));
  }, [categoriesList]);

  const summaryFacts = useMemo(() => {
    if (!detail) {
      return [];
    }
    const attemptLabel = formatOrdinal(detail.attemptNumber);
    const respondingSuppliers = detail.respondingSupplierCount ?? detail.responseCount ?? 0;
    const rawResponseTotal = detail.rawResponseCount ?? respondingSuppliers;
    const assignedLabel = detail.totalSuppliersAssigned ?? "—";
    const postedShort = detail.postedDateISO
      ? formatShortDate(detail.postedDateISO)
      : formatShortDate(detail.posted) || detail.posted || "—";
    const closingShort = detail.endDateISO
      ? formatShortDate(detail.endDateISO)
      : formatShortDate(detail.end) || detail.end || "—";

    const formatCountLabel = (count, singular) => {
      if (!Number.isFinite(count)) {
        return "—";
      }
      const base = `${count} ${singular}${count === 1 ? "" : "s"}`;
      return base;
    };

    const responsesSummaryValue = rawResponseTotal > respondingSuppliers
      ? `${formatCountLabel(respondingSuppliers, "supplier")} • ${formatCountLabel(rawResponseTotal, "file")}`
      : formatCountLabel(respondingSuppliers, "supplier");

    return [
      { key: "attempt", label: "Attempt", value: attemptLabel },
      {
        key: "responses",
        label: "Responding Suppliers",
        value: responsesSummaryValue,
        accent: respondingSuppliers > 0,
      },
      { key: "assigned", label: "Assigned", value: assignedLabel },
      { key: "posted", label: "Posted", value: postedShort || "—" },
      { key: "closing", label: "Closes", value: closingShort || "—" },
    ];
  }, [detail]);

  return (
    <div className="announcement-detail-page">
      <Toast
        type={toast.type}
        message={toast.message}
        visible={toast.visible}
        onClose={handleCloseToast}
        duration={3200}
      />

      <header className="announcement-detail-header">
        <button
          type="button"
          className="announcement-detail-back"
          onClick={() => navigate(-1)}
        >
          ← Back to Dashboard
        </button>
        <div className="announcement-detail-title">
          <h2>{detail?.title || "Announcement Detail"}</h2>
          {detail?.status && (
            <span
              className="announcement-detail-status"
              style={{ backgroundColor: getStatusBadgeColor(detail.status) }}
            >
              {formatStatusLabel(detail.status)}
            </span>
          )}
        </div>
        {detail?.procurementStatus && detail.procurementStatus !== detail.status && (
          <span className="announcement-detail-procurement">
            Procurement Status: {formatStatusLabel(detail.procurementStatus)}
          </span>
        )}
      </header>

      {isLoading ? (
        <p className="announcement-detail-empty">Loading announcement information…</p>
      ) : error ? (
        <p className="announcement-detail-error">{error}</p>
      ) : !detail ? (
        <p className="announcement-detail-empty">Announcement not found.</p>
      ) : (
        <>
          {summaryFacts.length > 0 && (
            <section className="announcement-detail-summary">
              {summaryFacts.map(({ key, label, value, accent }) => (
                <div
                  key={key}
                  className={`announcement-detail-summary-item${accent ? " announcement-detail-summary-item--accent" : ""}`}
                >
                  <span className="announcement-detail-summary-label">{label}</span>
                  <span className="announcement-detail-summary-value">{value}</span>
                </div>
              ))}
            </section>
          )}

          <section className="announcement-detail-pane">
            <div className="announcement-detail-section">
              <div className="announcement-detail-section-header">
                <h3>Overview</h3>
              </div>
              <div className="announcement-detail-info-grid">
                <div className="announcement-detail-info announcement-detail-info--wide">
                  <span className="announcement-detail-info-label">Description</span>
                  <p className="announcement-detail-info-value announcement-detail-info-text">{detail.description}</p>
                </div>
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Posted</span>
                  <span className="announcement-detail-info-value">{detail.posted}</span>
                </div>
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Closing Date</span>
                  <span className="announcement-detail-info-value">{detail.end}</span>
                </div>
                {detail.fileName && (
                  <div className="announcement-detail-info">
                    <span className="announcement-detail-info-label">Attachment</span>
                    <span className="announcement-detail-info-value">{detail.fileName}</span>
                  </div>
                )}
                <div className="announcement-detail-info announcement-detail-info--wide">
                  <span className="announcement-detail-info-label">Categories</span>
                  {groupedCategories.length > 0 ? (
                    <div className="announcement-detail-category-groups">
                      {groupedCategories.map(({ key: groupKey, label, items }) => (
                        <div key={groupKey} className="announcement-detail-category-group">
                          <div className="announcement-detail-category-heading">
                            <span className="announcement-detail-category-label">{label}</span>
                            <span className="announcement-detail-category-count">{items.length}</span>
                          </div>
                          <div className="announcement-detail-chip-grid">
                            {items.map((category) => (
                              <span key={`${groupKey}-${category}`} className="announcement-detail-chip">
                                {category}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="announcement-detail-info-empty">Uncategorized</span>
                  )}
                </div>
              </div>
            </div>

            <div className="announcement-detail-section">
              <div className="announcement-detail-section-header">
                <h3>Attempts &amp; Timeline</h3>
              </div>
              <div className="announcement-detail-info-grid">
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Attempt Count</span>
                  <span className="announcement-detail-info-value">{formatOrdinal(detail.attemptNumber)}</span>
                </div>
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Attempt Status</span>
                  <span className="announcement-detail-info-value">{formatStatusLabel(detail.attemptStatus)}</span>
                </div>
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Sent On</span>
                  <span className="announcement-detail-info-value">
                    {detail.attemptSentAt ? new Date(detail.attemptSentAt).toLocaleString("en-US") : "—"}
                  </span>
                </div>
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Due By</span>
                  <span className="announcement-detail-info-value">
                    {detail.attemptDueAt
                      ? new Date(detail.attemptDueAt).toLocaleString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                </div>
                {detail.awardedSupplierName && (
                  <div className="announcement-detail-info">
                    <span className="announcement-detail-info-label">Awarded Supplier</span>
                    <span className="announcement-detail-info-value">{detail.awardedSupplierName}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="announcement-detail-section">
              <div className="announcement-detail-section-header">
                <h3>Supplier Engagement</h3>
              </div>
              <div className="announcement-detail-info-grid">
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Total Assigned</span>
                  <span className="announcement-detail-info-value">{detail.totalSuppliersAssigned ?? "—"}</span>
                </div>
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Responding Suppliers</span>
                  <span className="announcement-detail-info-value">
                    {respondingSuppliersCount}
                    {rawResponseTotalCount > respondingSuppliersCount ? (
                      <span className="announcement-detail-info-note"> ({rawResponseTotalCount} file{rawResponseTotalCount === 1 ? "" : "s"})</span>
                    ) : null}
                  </span>
                </div>
                <div className="announcement-detail-info">
                  <span className="announcement-detail-info-label">Answered</span>
                  <span className="announcement-detail-info-value">{detail.answeredSupplierCount ?? 0}</span>
                </div>
                {detail.suppliers?.length ? (
                  <div className="announcement-detail-info announcement-detail-info--wide">
                    <span className="announcement-detail-info-label">Recipient List</span>
                    <p className="announcement-detail-info-value announcement-detail-info-text">
                      {detail.suppliers.join(", ")}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="announcement-detail-actions">
            <button
              type="button"
              className="announcement-detail-action announcement-detail-action--primary"
              onClick={handleOpenResponses}
            >
              View Supplier Responses
            </button>
            <button
              type="button"
              className="announcement-detail-action announcement-detail-action--secondary"
              onClick={() => handleShowStatusHistory(detail)}
            >
              View Status Timeline
            </button>
          </section>
        </>
      )}

      <StatusHistoryModal
        visible={historyModal.visible}
        records={historyModal.records}
        announcement={historyModal.announcement}
        loading={historyModal.loading}
        error={historyModal.error}
        onClose={closeHistoryModal}
      />

      {selectedAnnouncement && (
        <ResponseModal
          announcement={selectedAnnouncement}
          responses={responses}
          isLoading={isResponseLoading}
          onClose={closeResponseModal}
          onShowHistory={handleShowStatusHistory}
          historyLoading={historyModal.loading && historyModal.visible}
        />
      )}
    </div>
  );
};

export default AnnouncementDetail;
