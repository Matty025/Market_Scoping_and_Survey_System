import React from "react";
import "./StatusUpdateModal.css";

const StatusUpdateModal = ({
  visible,
  title,
  message,
  supplierOptions = [],
  supplierRequired = false,
  supplierValue = "",
  onSupplierChange,
  notesValue = "",
  onNotesChange,
  notesRequired = false,
  showNotes = true,
  submitting = false,
  error = "",
  onCancel,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  disableConfirm = false,
}) => {
  if (!visible) {
    return null;
  }

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget && !submitting) {
      onCancel?.();
    }
  };

  const handleSupplierChange = (event) => {
    onSupplierChange?.(event.target.value);
  };

  const handleNotesChange = (event) => {
    onNotesChange?.(event.target.value);
  };

  const shouldRenderSupplierField = supplierRequired || supplierOptions.length > 0;
  const confirmDisabled = disableConfirm || submitting;

  const notesLabel = notesRequired ? "Notes" : "Notes (optional)";

  return (
    <div className="status-update-modal__overlay" onClick={handleOverlayClick}>
      <div className="status-update-modal__container" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="status-update-modal__close"
          onClick={onCancel}
          disabled={submitting}
        >
          ✖
        </button>

        <h3 className="status-update-modal__title">{title}</h3>
        {message && <p className="status-update-modal__message">{message}</p>}

        {shouldRenderSupplierField && (
          <div className="status-update-modal__field">
            <label htmlFor="status-update-modal-supplier">
              Awarded Supplier
              {supplierRequired && <span className="status-update-modal__required-marker">*</span>}
            </label>
            <select
              id="status-update-modal-supplier"
              value={supplierValue}
              onChange={handleSupplierChange}
              disabled={submitting}
            >
              <option value="">Select supplier…</option>
              {supplierOptions.map((option) => (
                <option key={option.id} value={String(option.id)}>
                  {option.name}
                </option>
              ))}
            </select>
            {supplierRequired && supplierOptions.length === 0 && (
              <small className="status-update-modal__hint">
                No suppliers are associated with this announcement.
              </small>
            )}
          </div>
        )}

        {showNotes && (
          <div className="status-update-modal__field">
            <label htmlFor="status-update-modal-notes">
              {notesLabel}
              {notesRequired && <span className="status-update-modal__required-marker">*</span>}
            </label>
            <textarea
              id="status-update-modal-notes"
              value={notesValue}
              onChange={handleNotesChange}
              rows={notesRequired ? 4 : 3}
              disabled={submitting}
              placeholder="Add context for this status update"
            />
            {!notesRequired && (
              <small className="status-update-modal__hint">Optional but recommended for audit logs.</small>
            )}
          </div>
        )}

        {error && <p className="status-update-modal__error">{error}</p>}

        <div className="status-update-modal__actions">
          <button
            type="button"
            className="status-update-modal__secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="status-update-modal__primary"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StatusUpdateModal;
