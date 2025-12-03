import React, { useMemo } from "react";
import "./StatusHistoryModal.css";

const formatStatusLabel = (status) => {
  if (!status) return "Unknown";
  return String(status)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
};

const formatOrdinal = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
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

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (err) {
    return "—";
  }
};

const StatusHistoryModal = ({ visible, onClose, records = [], announcement, loading = false, error = null }) => {
  if (!visible) {
    return null;
  }

  const processedRows = useMemo(() => {
    if (!Array.isArray(records) || records.length === 0) {
      return [];
    }

    const sorted = [...records].sort((a, b) => {
      const aTime = a.changedAt ? new Date(a.changedAt).getTime() : 0;
      const bTime = b.changedAt ? new Date(b.changedAt).getTime() : 0;
      return aTime - bTime;
    });

    let currentAttempt = 0;
    return sorted.map((row) => {
      const next = { ...row };
      const newStatusUpper = next.newStatus ? String(next.newStatus).toUpperCase() : "";
      if (newStatusUpper === "ACTIVE") {
        currentAttempt += 1;
      }
      next.attemptNumber = currentAttempt > 0 ? currentAttempt : null;
      return next;
    }).reverse();
  }, [records]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal status-history-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          ✖
        </button>
        <h3>Status & Attempt History</h3>
        {announcement ? (
          <p className="status-history-summary">
            <strong>{announcement.title}</strong>
          </p>
        ) : null}
        {error ? (
          <p className="status-history-error">{error}</p>
        ) : null}
        <div className="status-history-table-wrapper">
          <table className="status-history-table">
            <thead>
              <tr>
                <th>Attempt</th>
                <th>From</th>
                <th>To</th>
                <th>Notes</th>
                <th>Changed By</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center" }}>Loading history…</td>
                </tr>
              ) : processedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center" }}>No status changes recorded.</td>
                </tr>
              ) : (
                processedRows.map((item) => {
                  const attemptLabel = formatOrdinal(item.attemptNumber);
                  return (
                    <tr key={item.id}>
                      <td className="status-history-attempt">{attemptLabel ? attemptLabel : "—"}</td>
                      <td className="status-history-status">{formatStatusLabel(item.oldStatus)}</td>
                      <td className="status-history-status">{formatStatusLabel(item.newStatus)}</td>
                      <td className="status-history-notes">{item.notes && item.notes.trim().length > 0 ? item.notes : "—"}</td>
                      <td className="status-history-user">{item.changedByName || (item.changedBy ? `User ${item.changedBy}` : "—")}</td>
                      <td className="status-history-date">{formatDateTime(item.changedAt)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StatusHistoryModal;
