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
    date: "",
  });

  const [modalItem, setModalItem] = useState(null);
  const [categoryModalItem, setCategoryModalItem] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Category filters
  const [mainCategories, setMainCategories] = useState([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState("");
  const [selectedSubCategory, setSelectedSubCategory] = useState("");

  // Supplier + category data
  const [allSuppliers, setAllSuppliers] = useState([]);
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

        // Debug: Log the raw response
        console.log("Raw Suppliers Response:", suppliersRes.data);

        // Map the backend response to match expected format
        // Backend returns: {id, name, email, location}
        // Frontend expects: {SupplierID, CompanyName}
        const mappedSuppliers = (suppliersRes.data || [])
          .filter((s) => s && s.id != null && s.name)
          .map((s) => ({
            SupplierID: s.id,
            CompanyName: s.name,
            Address: s.location || s.Address,
            ContactNumber: s.ContactNumber,
            Email: s.email,
          }));
        
        console.log("Mapped Suppliers:", mappedSuppliers);
        setAllSuppliers(mappedSuppliers);

        const allCats = categoriesRes.data || [];
        setAllCategories(allCats);
        setMainCategories(allCats.filter((c) => !c.ParentCategoryID));
      } catch (err) {
        console.error("Failed to fetch initial data", err);
        console.error("Error details:", err.response?.data);
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
    console.log(`Filter changed: ${name} = ${value}`); // Debug log
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleMainCategoryChange = (e) => {
    const mainCatId = e.target.value;
    setSelectedMainCategory(mainCatId);
    setSelectedSubCategory("");

    if (mainCatId) {
      const selectedCat = allCategories.find(
        (c) => c.CategoryID === parseInt(mainCatId, 10)
      );
      setSubCategoryOptions(selectedCat?.Subcategories || []);
      setFilters((prev) => ({ ...prev, category: mainCatId }));
    } else {
      setSubCategoryOptions([]);
      setFilters((prev) => ({ ...prev, category: "" }));
    }
  };

  const handleSubCategoryChange = (e) => {
    const subCatId = e.target.value;
    setSelectedSubCategory(subCatId);
    setFilters((prev) => ({ ...prev, category: subCatId }));
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
          <option value="">All Categories</option>
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
          <option value="">All Subcategories</option>
          {subCategoryOptions.map((subCat) => (
            <option key={`sub-${subCat.CategoryID}`} value={subCat.CategoryID}>
              {subCat.CategoryName}
            </option>
          ))}
        </select>

        {/* SUPPLIER - FIXED */}
        <select
          name="supplier"
          value={filters.supplier}
          onChange={handleFilterChange}
          className="market-supplier-select"
        >
          <option value="">All Suppliers</option>
          {allSuppliers.map((s) => (
            <option key={`sup-${s.SupplierID}`} value={s.SupplierID}>
              {s.CompanyName}
            </option>
          ))}
        </select>

        {/* DATE */}
        <input
          type="date"
          name="date"
          value={filters.date}
          onChange={handleFilterChange}
          className="market-date-input"
        />
      </div>

      {/* Debug info - Remove this after fixing */}
      {allSuppliers.length === 0 && !isLoading && (
        <p style={{ color: "orange", padding: "10px" }}>
          ⚠️ No suppliers loaded. Check console for errors.
        </p>
      )}

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
              <div className="market-card-content">
                <h4>{item.name}</h4>
                {item.description && (
                  <p className="item-description">{item.description}</p>
                )}
                {item.categories && (
                  <div className="category-tags">
                    {item.categories
                      .split(", ")
                      .slice(0, 2)
                      .map((cat, idx) => (
                        <span key={idx} className="category-badge">
                          {cat}
                        </span>
                      ))}
                    {item.categories.split(", ").length > 2 && (
                      <button
                        className="show-more-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCategoryModalItem(item);
                        }}
                      >
                        Show More...
                      </button>
                    )}
                  </div>
                )}
                <p>
                  <strong>Supplier:</strong> {item.company}
                </p>
                <p className="item-updated">
                  <strong>Updated:</strong>{" "}
                  {new Date(item.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <div className="market-card-footer">
                <p className="item-price">
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
            <button
              className="modal-close-btn"
              onClick={() => setModalItem(null)}
            >
              ✖
            </button>
            <h2>{modalItem.name}</h2>
            {modalItem.description && (
              <p className="modal-description">
                <strong>Description:</strong> {modalItem.description}
              </p>
            )}
            {modalItem.categories && (
              <div className="modal-info-row">
                <strong>Categories:</strong>
                <div className="category-tags modal-categories">
                  {modalItem.categories.split(', ').map((cat, idx) => (
                    <span key={idx} className="category-badge">
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p>
              <strong>Supplier:</strong> {modalItem.company}
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
              <strong>Price:</strong> ₱{modalItem.price.toLocaleString()}
            </p>
            <p>
              <strong>Stock:</strong> {modalItem.stock}
            </p>
            {modalItem.location && (
              <p>
                <strong>Location:</strong> {modalItem.location}
              </p>
            )}
            <button
              className="bookmark-btn modal-bookmark"
              onClick={() => toggleBookmark(modalItem)}
            >
              ⭐ Add to Bookmark
            </button>
          </div>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {categoryModalItem && (
        <div
          className="market-modal"
          onClick={() => setCategoryModalItem(null)}
        >
          <div
            className="market-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close-btn"
              onClick={() => setCategoryModalItem(null)}
            >
              ✖
            </button>
            <h2>Categories for {categoryModalItem.name}</h2>
            <div className="category-tags modal-categories">
              {categoryModalItem.categories
                .split(", ")
                .map((cat, idx) => (
                  <span key={idx} className="category-badge">
                    {cat}
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Market;