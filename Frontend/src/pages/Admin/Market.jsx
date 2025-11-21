import React, { useState, useEffect, useCallback } from "react";
import "./Market.css";
import axios from "axios";
import { useAuth } from "../../components/AuthContext"; // Assuming you have AuthContext for admin too
const Market = () => {
  const { token } = useAuth();
  const [marketItems, setMarketItems] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    supplier: "",
    dateFrom: "",
    dateTo: "",
  });
  const [modalItem, setModalItem] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // These would also be fetched from the backend in a real app
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [allCategories, setAllCategories] = useState([]);

  // Debounce handler to prevent API calls on every keystroke
  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  const fetchMarketData = useCallback(async (currentFilters) => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await axios.get("http://localhost:3001/api/admin/market-items", {
        headers: { Authorization: `Bearer ${token}` },
        params: currentFilters,
      });
      setMarketItems(res.data || []);
    } catch (err) {
      console.error("Failed to fetch market data", err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Use a debounced version for fetching
  const debouncedFetch = useCallback(debounce(fetchMarketData, 500), [fetchMarketData]);

  useEffect(() => {
    // Fetch initial data and filter options
    const fetchInitialData = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        // Fetch filter options and initial market data in parallel for speed
        const [marketRes, suppliersRes, categoriesRes] = await Promise.all([
          axios.get("http://localhost:3001/api/admin/market-items", { headers: { Authorization: `Bearer ${token}` } }),
          axios.get("http://localhost:3001/api/admin/suppliers", { headers: { Authorization: `Bearer ${token}` } }),
          axios.get("http://localhost:3001/api/admin/categories", { headers: { Authorization: `Bearer ${token}` } })
        ]);

        setMarketItems(marketRes.data || []);
        setAllSuppliers(["All", ...suppliersRes.data.map(s => s.CompanyName)]);
        // Flatten the hierarchical categories for the dropdown
        setAllCategories(["All", ...categoriesRes.data.map(c => c.CategoryName)]);
      } catch (err) {
        console.error("Failed to fetch initial data", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchInitialData();
    }
  }, [token]);

  useEffect(() => {
    debouncedFetch(filters);
  }, [filters, debouncedFetch]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const toggleBookmark = (item) => {
    if (bookmarks.find((b) => b.id === item.id)) {
      setBookmarks((prev) => prev.filter((b) => b.id !== item.id));
    } else {
      setBookmarks((prev) => [...prev, item]);
    }
  };

  const displayedItems = showBookmarks ? bookmarks : marketItems;

  return (
    <div className="market-container">
      <div className="market-header">
        <h2>🛒 Market</h2>
        <button
          className={`bookmark-view-btn ${showBookmarks ? "active" : ""}`}
          onClick={() => setShowBookmarks(!showBookmarks)}>
          ⭐ {showBookmarks ? "View All Items" : "View Bookmarked"}
        </button>
      </div>
      <p>Browse and survey available products from suppliers.</p>

      {/* Filters */}
      <div className="market-filter-bar">
        <input
          type="text"
          name="search"
          placeholder="Search by product or supplier..."
          value={filters.search}
          onChange={handleFilterChange}
          className="market-search-input"
        />
        <select
          name="category"
          value={filters.category}
          onChange={handleFilterChange}
          className="market-category-select">
          <option value="All">All Categories</option>
          {allCategories.map((cat) => (
            <option key={cat} value={cat === "All" ? "" : cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          name="supplier"
          value={filters.supplier}
          onChange={handleFilterChange}
          className="market-supplier-select">
          {allSuppliers.map((s) => (
            <option key={s} value={s === "All" ? "" : s}>
              {s}
            </option>
          ))}
        </select>
        <div className="date-filter-group">
          <label htmlFor="dateFrom">From:</label>
          <input
            type="date"
            name="dateFrom"
            value={filters.dateFrom}
            onChange={handleFilterChange}
            className="market-date-input" />
          <label htmlFor="dateTo">To:</label>
          <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} className="market-date-input" />
        </div>
      </div>

      {/* Product Grid */}
      <div className="market-grid">
        {isLoading ? (
          <p className="no-items">Loading products...</p>
        ) : displayedItems.length === 0 ? (
          <p className="no-items">No items found.</p>
        ) : (
          displayedItems.map((item) => (
            <div key={item.id} className="market-card" onClick={() => setModalItem(item)}>
              <h4>{item.name}</h4>
              <p>
                <strong>Supplier:</strong> {item.company}
              </p>
              <p>
                <strong>₱{item.price.toLocaleString()}</strong>
              </p>
              <button
                className={`bookmark-btn ${
                  bookmarks.find((b) => b.id === item.id) ? "active" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBookmark(item);
                }}>
                ⭐ {bookmarks.find((b) => b.id === item.id) ? "Bookmarked" : "Bookmark"}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Modal for Item Details */}
      {modalItem && (
        <div className="market-modal" onClick={() => setModalItem(null)}>
          <div className="market-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setModalItem(null)}>
              ✖
            </button>
            <h2>{modalItem.name}</h2>
            <p>
              <strong>Supplier:</strong> {modalItem.company}
            </p>
            <p>
              <strong>Category:</strong> {modalItem.category}
            </p>
            <p>
              <strong>Updated:</strong> {new Date(modalItem.date).toLocaleString("en-US", {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
            </p>
            <p>
              <strong>Unit:</strong> {modalItem.unit}
            </p>
            <p>
              <strong>Price:</strong> ₱{modalItem.price.toLocaleString()}
            </p>
            <p>
              <strong>Stock:</strong> {modalItem.stock}
            </p>
            <button className="bookmark-btn modal-bookmark" onClick={() => toggleBookmark(modalItem)}>
              ⭐ Add to Bookmark
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default Market;
