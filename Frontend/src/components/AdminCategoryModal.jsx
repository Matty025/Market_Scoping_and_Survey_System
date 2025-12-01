import React from "react";

const AdminCategoryModal = ({
  open,
  onClose,
  onSubmit,
  title,
  icon = null,
  confirmLabel,
  pendingLabel = "Saving...",
  isSubmitting,
  nameValue,
  onNameChange,
  nameInputId,
  parentValue,
  onParentChange,
  parentSelectId,
  parentOptions = [],
  disallowedParentIds = new Set(),
  parentLabel = "Parent (optional)",
}) => {
  if (!open) {
    return null;
  }

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const renderParentOptions = () =>
    parentOptions
      .filter((option) => !disallowedParentIds.has(option.id))
      .map((option) => (
        <option key={option.id} value={String(option.id)}>
          {Array.isArray(option.path) ? option.path.join(" › ") : option.name}
        </option>
      ));

  return (
    <div className="settings-modal-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal" role="dialog" aria-modal="true">
        <header className="settings-modal-header">
          <h3>
            {icon} {title}
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <form className="category-form" onSubmit={onSubmit}>
          <label htmlFor={nameInputId}>Name</label>
          <input
            id={nameInputId}
            type="text"
            value={nameValue}
            placeholder="Enter category name"
            onChange={(event) => onNameChange(event.target.value)}
          />

          <label htmlFor={parentSelectId}>{parentLabel}</label>
          <select
            id={parentSelectId}
            value={parentValue}
            onChange={(event) => onParentChange(event.target.value)}
          >
            <option value="">Top-level category</option>
            {renderParentOptions()}
          </select>

          <div className="settings-modal-actions">
            <button type="button" className="modal-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="modal-primary" disabled={isSubmitting}>
              {isSubmitting ? pendingLabel : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminCategoryModal;
