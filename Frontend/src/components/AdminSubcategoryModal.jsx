import React from "react";
import { FaSitemap, FaPlusCircle } from "react-icons/fa";

const formatCount = (value) => {
  const numeric = Number(value ?? 0);
  return Number.isNaN(numeric) ? "0" : new Intl.NumberFormat("en-US").format(numeric);
};

const AdminSubcategoryModal = ({
  open,
  parent,
  subcategories = [],
  onClose,
  onAddSubcategory,
  onEditSubcategory,
}) => {
  if (!open || !parent) {
    return null;
  }

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleAddClick = () => {
    onAddSubcategory(parent.CategoryID);
  };

  const currentCount = subcategories.length;
  const countLabel = currentCount === 1 ? "subcategory" : "subcategories";
  const totalDirectItems = subcategories.reduce(
    (sum, entry) => sum + Number(entry?.directItemCount ?? 0),
    0
  );
  const itemLabel = totalDirectItems === 1 ? "item" : "items";
  const summaryCount = formatCount(currentCount);
  const summaryItemCount = formatCount(totalDirectItems);

  return (
    <div className="settings-modal-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal" role="dialog" aria-modal="true">
        <header className="settings-modal-header">
          <h3>
            <FaSitemap /> Manage Subcategories
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="subcategory-toolbar">
          <p className="subcategory-summary">
            {parent.CategoryName} currently has {summaryCount} {countLabel} holding {summaryItemCount} direct {itemLabel}.
          </p>
          <button type="button" className="category-action" onClick={handleAddClick}>
            <FaPlusCircle /> Add Subcategory
          </button>
        </div>

        {subcategories.length === 0 ? (
          <p className="settings-placeholder subcategory-empty">
            No subcategories yet. Use “Add Subcategory” to create one.
          </p>
        ) : (
          <div className="subcategory-table-wrapper">
            <table className="subcategory-table">
              <thead>
                <tr>
                  <th scope="col">Subcategory</th>
                  <th scope="col">Items</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subcategories.map((item) => {
                  const { node, directChildCount, directItemCount, totalItemCount } = item;
                  const hasNestedCategories = directChildCount > 0;
                  const hasExtraNestedItems = totalItemCount > directItemCount;
                  const childSuffix = hasNestedCategories
                    ? `(${formatCount(directChildCount)} subcategor${directChildCount === 1 ? "y" : "ies"})`
                    : "";
                  const formattedDirectItems = formatCount(directItemCount);
                  const nestedItemsSuffix = hasExtraNestedItems
                    ? ` (incl. ${formatCount(totalItemCount)} across nested categories)`
                    : "";
                  const formattedItemLabel = `${formattedDirectItems}${nestedItemsSuffix}`.trim();
                  return (
                    <tr key={node.CategoryID}>
                      <td>
                        {node.CategoryName}
                        {hasNestedCategories ? (
                          <span className="subcategory-count" title={childSuffix}> {childSuffix}</span>
                        ) : null}
                      </td>
                      <td>
                        <span className="subcategory-count" title={formattedItemLabel}>
                          {formattedDirectItems}
                          {nestedItemsSuffix}
                        </span>
                      </td>
                      <td>
                        <div className="category-action-group">
                          <button
                            type="button"
                            className="category-action"
                            onClick={() => onEditSubcategory(node.CategoryID)}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="settings-modal-actions">
          <button type="button" className="modal-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminSubcategoryModal;
