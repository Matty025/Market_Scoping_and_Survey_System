import React, { useState, useEffect, useCallback } from "react";
import "./Market.css";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";

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

  // Category filters
  const [mainCategories, setMainCategories] = useState([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState("");
  const [selectedSubCategory, setSelectedSubCategory] = useState("");

  // Supplier + category data
  const [allSuppliers, setAllSuppliers] = useState([]); // Now storing full supplier objects
  const [allCategories, setAllCategories] = useState([]);

  // Debounce function
  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  const fetchMarketData = useCallback(
    async (currentFilters) => {
      if (!token) return;
      setIsLoading(true);
      try {
        const res = await axios.get(
          "http://localhost:3001/api/admin/market-items",
          {
            headers: { Authorization: `Bearer ${token}` },
            params: currentFilters,
          }
        );
        setMarketItems(res.data || []);
      } catch (err) {
        console.error("Failed to fetch market data", err);
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  const debouncedFetch = useCallback(debounce(fetchMarketData, 500), [
    fetchMarketData,
  ]);

  // Load suppliers + categories
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!token) return;

      setIsLoading(true);
      try {
        const [suppliersRes, categoriesRes] = await Promise.all([
          axios.get("http://localhost:3001/api/admin/suppliers", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get("http://localhost:3001/api/admin/categories", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        // Filter out suppliers with null or undefined IDs to prevent key errors
        const validSuppliers = (suppliersRes.data || []).filter(s => s && s.SupplierID != null);
        setAllSuppliers(validSuppliers);

        const allCats = categoriesRes.data || [];
        setAllCategories(allCats);

        setMainCategories(allCats.filter((c) => !c.ParentCategoryID));
      } catch (err) {
        console.error("Failed to fetch initial data", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (token) fetchInitialData();
  }, [token]);

  useEffect(() => {
    debouncedFetch(filters);
  }, [filters, debouncedFetch]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleMainCategoryChange = (e) => {
    const mainCatId = e.target.value;
    setSelectedMainCategory(mainCatId);

    if (mainCatId) {
      const selectedCat = allCategories.find(
        (c) => c.CategoryID === parseInt(mainCatId, 10)
      );
      setSubCategoryOptions(selectedCat?.Subcategories || []);
      // Set the main category as the filter, but allow subcategory to override
      setFilters((prev) => ({ ...prev, category: mainCatId }));
    } else {
      // Clear subcategory selection and filter when main category is cleared
      setSubCategoryOptions([]);
      setSelectedSubCategory("");
      setFilters((prev) => ({ ...prev, category: "" }));
    }
  };

  const handleSubCategoryChange = (e) => {
    setSelectedSubCategory(e.target.value);
    handleFilterChange(e); // Reuse the existing filter update logic
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
          onClick={() => setShowBookmarks(!showBookmarks)}
        >
          ⭐ {showBookmarks ? "View All Items" : "View Bookmarked"}
        </button>
      </div>

      <p>Browse and survey available products from suppliers.</p>

      {/* FILTERS */}
      <div className="market-filter-bar">
        <input
          type="text"
          name="search"
          placeholder="Search by product or supplier..."
          value={filters.search}
          onChange={handleFilterChange}
          className="market-search-input"
        />

        {/* MAIN CATEGORY */}
        <select
          name="mainCategory"
          value={selectedMainCategory}
          onChange={handleMainCategoryChange}
          className="market-category-select"
        >
          <option value="" key="all-main-categories">All Categories</option>
          {mainCategories.map((cat) => (
            <option key={`main-${cat.CategoryID}`} value={cat.CategoryID}>
              {cat.CategoryName}
            </option>
          ))}
        </select>

        {/* SUBCATEGORY */}
        <select
          name="category"
          value={selectedSubCategory}
          onChange={handleSubCategoryChange}
          className="market-category-select"
          disabled={!subCategoryOptions.length}
        >
          <option value="" key="all-subcategories">All Subcategories</option>
          {subCategoryOptions.map((subCat) => (
            <option key={`sub-${subCat.CategoryID}`} value={subCat.CategoryID}>
              {subCat.CategoryName}
            </option>
          ))}
        </select>

        {/* SUPPLIER */}
        <select
          name="supplier"
          value={filters.supplier}
          onChange={handleFilterChange}
          className="market-supplier-select"
        >
          <option value="" key="all-suppliers">All Suppliers</option>
          {allSuppliers.map((s) => (
            <option key={`sup-${s.SupplierID}`} value={s.SupplierID}>
              {s.CompanyName}
            </option>
          ))}
        </select>

        {/* DATE */}
        <div className="date-filter-group">
          <label>From:</label>
          <input
            type="date"
            name="dateFrom"
            value={filters.dateFrom}
            onChange={handleFilterChange}
            className="market-date-input"
          />

          <label>To:</label>
          <input
            type="date"
            name="dateTo"
            value={filters.dateTo}
            onChange={handleFilterChange}
            className="market-date-input"
          />
        </div>
      </div>

      {/* PRODUCT GRID */}
      <div className="market-grid">
        {isLoading ? (
          <p className="no-items">Loading products...</p>
        ) : displayedItems.length === 0 ? (
          <p className="no-items">No items found.</p>
        ) : (
          displayedItems.map((item) => (
            <div
              key={item.id}
              className="market-card"
              onClick={() => setModalItem(item)}
            >
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
                }}
              >
                ⭐{" "}
                {bookmarks.find((b) => b.id === item.id)
                  ? "Bookmarked"
                  : "Bookmark"}
              </button>
            </div>
          ))
        )}
      </div>

      {/* MODAL */}
      {modalItem && (
        <div className="market-modal" onClick={() => setModalItem(null)}>
          <div
            className="market-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close-btn" onClick={() => setModalItem(null)}>
              ✖
            </button>

            <h2>{modalItem.name}</h2>
            <p>
              <strong>Supplier:</strong> {modalItem.company}
            </p>
            <p>
              <strong>Category:</strong> {modalItem.categoryname || 'N/A'}
            </p>
            <p>
              <strong>Updated:</strong>{" "}
              {new Date(modalItem.date).toLocaleString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
            <p>
              <strong>Unit:</strong> {modalItem.unit}
            </p>
            <p>
              <strong>Price:</strong> ₱
              {modalItem.price.toLocaleString()}
            </p>
            <p>
              <strong>Stock:</strong> {modalItem.stock}
            </p>

            <button
              className="bookmark-btn modal-bookmark"
              onClick={() => toggleBookmark(modalItem)}
            >
              ⭐ Add to Bookmark
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Market;