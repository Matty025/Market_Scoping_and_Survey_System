import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import "./SupplierActionHistory.css";

const backendBase = "http://localhost:3001";

const SupplierActionHistory = ({ supplierId }) => {
  const { token } = useAuth();
  const [history, setHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    if (!supplierId || !token) {
      setIsLoading(false);
      return;
    }

    const fetchHistory = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const historyRes = await axios.get(
          `${backendBase}/api/admin/suppliers/${supplierId}/history`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setHistory(historyRes.data || []);
        setFilteredHistory(historyRes.data || []);
      } catch (err) {
        console.error("Failed to fetch supplier action history", err);
        setError("Failed to load supplier history. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [supplierId, token]);

  useEffect(() => {
    let filtered = history;

    if (actionFilter) {
      filtered = filtered.filter((record) => record.actionType === actionFilter);
    }

    setFilteredHistory(filtered);
  }, [history, actionFilter]);

  const formatDetails = (action) => {
    // Use the joined item name if available, otherwise fall back to the ID.
    // This is especially useful for deleted items where the name might not be available anymore.
    let targetName = `Item ID ${action.targetId}`; // Default fallback
    if (action.itemName) {
      // If the item still exists, use its current name from the JOIN
      targetName = `'${action.itemName}'`;
    } else if (action.details?.deletedItemName) {
      // If the item is deleted, use the name we saved in the details
      targetName = `'${action.details.deletedItemName}' (Deleted)`;
    }

    // If details is present and may contain multiple changes, create a concise preview
    if (action.details) {
      const d = action.details;

      // Case: details contains an array of changes (common shape for bulk updates)
      const changeArray = Array.isArray(d.changes) ? d.changes : (Array.isArray(d) ? d : null);
      if (changeArray && changeArray.length > 0) {
        const fields = changeArray.map((c) => c.field || c.name || Object.keys(c || {})[0]).filter(Boolean);
        const uniq = [...new Set(fields)];
        const previewFields = uniq.slice(0, 2).join(', ');
        const more = uniq.length > 2 ? ` +${uniq.length - 2} more` : '';
        return `Updated ${previewFields}${more} for ${targetName}`;
      }

      // Case: single-field update with explicit field/oldValue/newValue
      if (d.field && (d.oldValue !== undefined || d.newValue !== undefined)) {
        return `Updated ${d.field.toLowerCase()} for ${targetName} from '${d.oldValue}' to '${d.newValue}'`;
      }

      // Case: createdItem structure
      if (d.createdItem && (d.createdItem.name || Object.keys(d.createdItem).length > 0)) {
        return `Created new product: ${d.createdItem.name || targetName}`;
      }

      // Case: deleted item name (already handled for targetName but return short text)
      if (d.deletedItemName) {
        return `Deleted product: '${d.deletedItemName}' (Deleted)`;
      }

      // Generic object with multiple keys — summarize the keys changed
      if (typeof d === 'object' && Object.keys(d).length > 0) {
        const skip = ['deletedItemName', 'createdItem', 'field', 'oldValue', 'newValue'];
        const changed = Object.keys(d).filter((k) => !skip.includes(k));
        if (changed.length > 0) {
          const preview = changed.slice(0, 3).join(', ');
          const more = changed.length > 3 ? ` +${changed.length - 3} more` : '';
          return `Updated ${preview}${more} for ${targetName}`;
        }
      }
    }
  
    // Handle simple, non-detailed actions based on their type
    switch (action.actionType) {
      case 'ITEM_CREATED':
        return `Created new product: ${targetName}`;
      case 'ITEM_DELETED':
        return `Deleted product: ${targetName}`;
      default:
        // A generic fallback for any other action
        return `Performed action on ${targetName}`;
    }
  };

  const formatChangeSummary = (record) => {
    if (!record.details) {
      return null; // No summary if there are no details
    }

    switch (record.actionType) {
      case 'ITEM_CREATED':
        const created = record.details.createdItem;
        if (created) {
          return `Created a new item with Name: ${created.name}, Price: ${created.price}, Stock: ${created.stock}.`;
        }
        return "Item was created.";
      case 'ITEM_UPDATED':
        const { field, oldValue, newValue } = record.details;
        // Return JSX for a more structured layout
        return (
          <div className="update-summary">
            <p>The field <strong>{field}</strong> was updated:</p>
            <ul>
              <li><span className="summary-label old-value">Old Value:</span> {String(oldValue)}</li>
              <li><span className="summary-label new-value">New Value:</span> {String(newValue)}</li>
            </ul>
          </div>
        );
      case 'ITEM_DELETED':
        if (record.details.deletedItemName) {
          return `The item '${record.details.deletedItemName}' was permanently deleted.`;
        }
        return "An item was deleted.";
      default:
        return "View raw data for more information.";
    }
  };
  const handleRowClick = (record) => {
    setSelectedRecord(record);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedRecord(null);
  };

  const actionTypes = [...new Set(history.map((record) => record.actionType))];

  return (
    <div className="supplier-action-history-page">
      <header className="history-header">
        <h3>Supplier Action History</h3>
        <p>Review all actions performed by this supplier.</p>
      </header>

      <div className="filters-card">
        <div className="filter-group">
          <label htmlFor="action-filter">Action Type</label>
          <select
            id="action-filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="filter-select"
          >
            <option value="">All Actions</option>
            {actionTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <button
            onClick={() => {
              setActionFilter("");
            }}
            className="clear-filters-btn"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Details</th>
              <th>Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="4">Loading history...</td></tr>
            ) : error ? (
              <tr><td colSpan="4" className="error-message">{error}</td></tr>
            ) : filteredHistory.length > 0 ? (
              filteredHistory.map((record) => (
                <tr
                  key={record.historyId}
                  onClick={() => handleRowClick(record)}
                  className="clickable-row"
                >
                  <td>
                    <span className={`action-badge ${record.actionType.toLowerCase()}`}>
                      {record.actionType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </td>
                  <td className="details-cell">{formatDetails(record)}</td>
                  <td>{record.createdAt ? new Date(record.createdAt).toLocaleString() : 'N/A'}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="4">No actions match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && selectedRecord && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h4>Action Details</h4>
              <button onClick={closeModal} className="modal-close-btn">&times;</button>
            </header>
            <div className="modal-body">
              <p><strong>User:</strong> {selectedRecord.userName}</p>
              <p><strong>Action:</strong> {selectedRecord.actionType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}</p>
              <p><strong>Date & Time:</strong> {selectedRecord.createdAt ? new Date(selectedRecord.createdAt).toLocaleString() : 'N/A'}</p>

              <div className="details-block">
                <strong>Details:</strong>
                {selectedRecord.details ? (
                  selectedRecord.actionType === 'ITEM_UPDATED' && selectedRecord.details.field ? (
                    <div className="details-table">
                      <div className="row"><span className="label">Field</span><span className="value">{selectedRecord.details.field}</span></div>
                      <div className="row"><span className="label">Old</span><span className="value">{String(selectedRecord.details.oldValue)}</span></div>
                      <div className="row"><span className="label">New</span><span className="value">{String(selectedRecord.details.newValue)}</span></div>
                    </div>
                  ) : selectedRecord.actionType === 'ITEM_CREATED' && selectedRecord.details.createdItem ? (
                    <div className="details-table">
                      {Object.entries(selectedRecord.details.createdItem).map(([k, v]) => (
                        <div className="row" key={k}><span className="label">{k}</span><span className="value">{String(v)}</span></div>
                      ))}
                    </div>
                  ) : selectedRecord.details.deletedItemName ? (
                    <div className="details-table">
                      <div className="row"><span className="label">Deleted Item Name</span><span className="value">{selectedRecord.details.deletedItemName}</span></div>
                    </div>
                  ) : (
                    <pre className="details-raw">{typeof selectedRecord.details === 'string' ? selectedRecord.details : JSON.stringify(selectedRecord.details, null, 2)}</pre>
                  )
                ) : (
                  <div className="no-details">— No additional details —</div>
                )}
              </div>

              {selectedRecord.details && (
                <div className="summary-container">
                  <strong>Summary of Changes:</strong>
                  <div className="summary-content">
                    {formatChangeSummary(selectedRecord)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierActionHistory;
