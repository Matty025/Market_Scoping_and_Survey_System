import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api";
import dayjs from "dayjs";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import AddProductForm from "./AddProductForm";
import "./ItemHealth.css";

 
const STALE_THRESHOLD_DAYS = 30;

const healthBadge = (daysStale) => {
  if (daysStale <= 7) {
    return { label: "Fresh", className: "reports-badge fresh" };
  }
  if (daysStale <= STALE_THRESHOLD_DAYS) {
    return { label: "Attention Soon", className: "reports-badge warning" };
  }
  return { label: "Needs Update", className: "reports-badge danger" };
};

const formatDate = (value) => {
  if (!value) {
    return "N/A";
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return String(value);
  }
  return parsed.format("MMM DD, YYYY");
};

const computeStaleInfo = (dateUpdated) => {
  const parsed = dayjs(dateUpdated);
  if (!parsed.isValid()) {
    return { days: Number.POSITIVE_INFINITY, label: "Never", badge: healthBadge(Number.POSITIVE_INFINITY) };
  }
  const days = dayjs().diff(parsed, "day");
  const safeDays = Number.isNaN(days) ? Number.POSITIVE_INFINITY : Math.max(days, 0);
  return {
    days: safeDays,
    label: `${safeDays} day${safeDays === 1 ? "" : "s"}`,
    badge: healthBadge(safeDays),
  };
};

const computeEffectiveInfo = (effectiveUntil) => {
  if (!effectiveUntil) {
    return {
      hasEffective: false,
      statusText: "No effective window set",
      badgeClass: "reports-effective-badge none",
      badgeLabel: "No Effective Date",
      requiresUpdate: false,
      isExpired: false,
      daysUntil: Number.POSITIVE_INFINITY,
    };
  }

  const effectiveDate = dayjs(effectiveUntil);
  if (!effectiveDate.isValid()) {
    return {
      hasEffective: false,
      statusText: "Invalid Effective Date",
      badgeClass: "reports-effective-badge none",
      badgeLabel: "Invalid",
      requiresUpdate: false,
      isExpired: false,
      daysUntil: Number.POSITIVE_INFINITY,
    };
  }

  const today = dayjs().startOf("day");
  const effectiveStart = effectiveDate.startOf("day");
  const daysUntil = effectiveStart.diff(today, "day");
  const requiresUpdate = daysUntil <= 0;

  let badgeLabel = "Effective";
  let statusText = `Effective until ${effectiveDate.format("MMM DD, YYYY")}`;

  if (requiresUpdate) {
    badgeLabel = daysUntil === 0 ? "Expired Today" : "Past Effective";
    statusText = `Past effective since ${effectiveDate.format("MMM DD, YYYY")}`;
  }

  return {
    hasEffective: true,
    effectiveDate,
    daysUntil,
    badgeClass: `reports-effective-badge ${requiresUpdate ? "expired" : "ok"}`,
    badgeLabel,
    statusText,
    requiresUpdate,
    isExpired: daysUntil < 0,
  };
};

export default function SupplierItemHealth() {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editProduct, setEditProduct] = useState(null);

  const closeEditor = useCallback(() => {
    setEditProduct(null);
  }, []);

  const showToast = useCallback((type, message) => {
    setToast({ visible: true, type, message });
  }, []);

  const fetchSupplierItems = useCallback(async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = { page: "1", q: search };
      const { data } = await api.get(`/api/supplier-files/items`, { params });
      const itemsWithHealth = Array.isArray(data?.items)
        ? data.items.map((item) => {
            const referenceDate = item.dateUpdated || item.datePosted;
            const staleInfo = computeStaleInfo(referenceDate);
            const effectiveInfo = computeEffectiveInfo(item.effectiveUntil);
            return { ...item, staleInfo, effectiveInfo };
          })
        : [];
      setItems(itemsWithHealth);
      setError(null);
    } catch (err) {
      console.error("Failed to load supplier items:", err);
      const message = err.response?.data?.message || "Unable to load items.";
      setError(message);
      setItems([]);
      showToast("error", message);
    } finally {
      setLoading(false);
    }
  }, [token, search, showToast]);

  useEffect(() => {
    fetchSupplierItems();
  }, [fetchSupplierItems]);

  const handleDelete = useCallback(
    async (item) => {
      const confirmed = window.confirm(
        `Delete ${item.name}? This action cannot be undone.`
      );
      if (!confirmed) {
        return;
      }

      try {
        await api.delete(`/api/supplier-files/items/${item.id}`);
        showToast("success", "Item deleted successfully.");
        fetchSupplierItems();
      } catch (err) {
        console.error("Failed to delete item:", err);
        const message = err.response?.data?.message || "Unable to delete item.";
        showToast("error", message);
      }
    },
    [token, fetchSupplierItems, showToast]
  );

  const filteredItems = useMemo(() => {
    if (filter === "all") {
      return items;
    }
    if (filter === "needs-update") {
      return items.filter((item) => item.staleInfo.days > STALE_THRESHOLD_DAYS);
    }
    if (filter === "fresh") {
      return items.filter((item) => item.staleInfo.days <= 7);
    }
    if (filter === "attention") {
      return items.filter(
        (item) => item.staleInfo.days > 7 && item.staleInfo.days <= STALE_THRESHOLD_DAYS
      );
    }
    if (filter === "past-effective") {
      return items.filter((item) => item.effectiveInfo?.requiresUpdate);
    }
    return items;
  }, [items, filter]);

  const stats = useMemo(() => {
    const total = items.length;
    const needsUpdate = items.filter((item) => item.staleInfo.days > STALE_THRESHOLD_DAYS).length;
    const fresh = items.filter((item) => item.staleInfo.days <= 7).length;
    const attention = items.filter(
      (item) => item.staleInfo.days > 7 && item.staleInfo.days <= STALE_THRESHOLD_DAYS
    ).length;
    const inactive = items.filter((item) => item.effectiveInfo?.requiresUpdate).length;
    const oldest = items.reduce((acc, item) => {
      if (item.staleInfo.days > (acc?.staleInfo.days ?? -1)) {
        return item;
      }
      return acc;
    }, null);
    return { total, needsUpdate, fresh, attention, inactive, oldest };
  }, [items]);

  return (
    <div className="supplier-reports-page">
      <Toast
        type={toast.type}
        message={toast.message}
        visible={toast.visible}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
        duration={3500}
      />

      <header className="supplier-reports-header">
        <div className="reports-heading">
          <h2>Item Health Catalog</h2>
          <p>Monitor last updates and effective windows so every listing stays accurate and ready for buyers.</p>
        </div>

        <div className="reports-controls">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search items by name"
            aria-label="Search items"
          />
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="fresh">Fresh (≤ 7 days)</option>
            <option value="attention">Needs attention soon</option>
            <option value="needs-update">Needs update (30+ days)</option>
            <option value="past-effective">Past effective window</option>
          </select>
        </div>
      </header>

      <section className="reports-stats-grid">
        <article className="reports-stat-card">
          <h3>Total Items</h3>
          <p className="stat-value">{stats.total}</p>
          <span className="stat-hint">All active listings synced with the system</span>
        </article>
        <article className="reports-stat-card">
          <h3>Needs Update</h3>
          <p className="stat-value danger">{stats.needsUpdate}</p>
          <span className="stat-hint">Items untouched for more than {STALE_THRESHOLD_DAYS} days</span>
        </article>
        <article className="reports-stat-card">
          <h3>Fresh Updates</h3>
          <p className="stat-value success">{stats.fresh}</p>
          <span className="stat-hint">Updated within the last 7 days</span>
        </article>
        <article className="reports-stat-card">
          <h3>Watch List</h3>
          <p className="stat-value warning">{stats.attention}</p>
          <span className="stat-hint">Plan updates before they become stale</span>
        </article>
        <article className="reports-stat-card">
          <h3>Past Effective</h3>
          <p className="stat-value danger">{stats.inactive}</p>
          <span className="stat-hint">Listings requiring updates to return to market</span>
        </article>
      </section>

      <section className="reports-table-wrapper">
        <table className="reports-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Price</th>
              <th scope="col">Stock</th>
              <th scope="col">Categories</th>
              <th scope="col">Effective Window</th>
              <th scope="col">Last Updated</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="reports-placeholder">
                  Loading items...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="reports-error">
                  {error}
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="reports-placeholder">
                  No items match your filters.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const badge = item.staleInfo.badge;
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="reports-item-name">
                        <strong>{item.name}</strong>
                        {item.description ? <span>{item.description}</span> : null}
                      </div>
                    </td>
                    <td>₱{Number(item.price ?? 0).toLocaleString()}</td>
                    <td>{Number(item.stock ?? 0).toLocaleString()} {item.unit || ""}</td>
                    <td>{item.categoryNames || "Uncategorized"}</td>
                    <td>
                      {item.effectiveInfo?.hasEffective ? (
                        <div className="reports-effective-wrap">
                          <span className={item.effectiveInfo.badgeClass}>{item.effectiveInfo.badgeLabel}</span>
                          <small>{item.effectiveInfo.statusText}</small>
                          {item.effectiveInfo.requiresUpdate ? (
                            <small className="reports-effective-warning">Update required — listing is past its effective window.</small>
                          ) : null}
                        </div>
                      ) : (
                        <span className="reports-effective-none">No effective date</span>
                      )}
                    </td>
                    <td>{formatDate(item.dateUpdated || item.datePosted)}</td>
                    <td>
                      <span className={badge.className}>{badge.label}</span>
                      <small className="reports-stale-label">{item.staleInfo.label}</small>
                      {item.effectiveInfo?.requiresUpdate ? (
                        <small className="reports-effective-flag">Needs attention: past effective window</small>
                      ) : null}
                    </td>
                    <td>
                      <div className="reports-actions">
                        <button
                          type="button"
                          className="reports-action edit"
                          onClick={() => setEditProduct(item)}
                        >
                          Update
                        </button>
                        <button
                          type="button"
                          className="reports-action delete"
                          onClick={() => handleDelete(item)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {editProduct ? (
        <AddProductForm
          editing={editProduct}
          onClose={closeEditor}
          onCreated={() => {
            closeEditor();
            fetchSupplierItems();
          }}
        />
      ) : null}
    </div>
  );
}
