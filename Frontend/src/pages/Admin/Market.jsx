import React, { useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import "./Market.css";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";

const computeEffectiveStatus = (rawValue) => {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return {
      hasDate: false,
      label: "No Effective Date",
      message: "No Effective Date",
      className: "market-effective none",
      badgeClass: "badge-none",
      formattedDate: null,
      isExpired: false,
    };
  }

  const effectiveDate = dayjs(rawValue);
  if (!effectiveDate.isValid()) {
    return {
      hasDate: false,
      label: "Invalid Date",
      message: "Unable to parse the effective until value provided by the supplier.",
      className: "market-effective none",
      badgeClass: "badge-none",
      formattedDate: null,
      isExpired: false,
    };
  }

  const today = dayjs().startOf("day");
  const daysRemaining = effectiveDate.startOf("day").diff(today, "day");
  const isExpired = daysRemaining <= 0;

  return {
    hasDate: true,
    label: isExpired ? (daysRemaining === 0 ? "Expired Today" : "Past Effective") : "Effective",
    message: isExpired
      ? `Past effective since ${effectiveDate.format("MMM D, YYYY")}`
      : `Effective until ${effectiveDate.format("MMM D, YYYY")}`,
    className: `market-effective ${isExpired ? "expired" : "active"}`,
    badgeClass: isExpired ? "badge-expired" : "badge-active",
    formattedDate: effectiveDate.format("MMM D, YYYY"),
    isExpired,
  };
};

const getLatestActivityDate = (item) => item?.dateUpdated || item?.date || item?.datePosted || null;

const getPostedDate = (item) => item?.datePosted || item?.date || null;

const formatDisplayDate = (value) => {
  if (!value) return "N/A";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("MMM D, YYYY") : "N/A";
};

const formatDisplayDateTime = (value) => {
  if (!value) return "N/A";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("MMM D, YYYY h:mm A") : "N/A";
};

const Market = () => {
  const { token } = useAuth();
  const [marketItems, setMarketItems] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    supplier: "",
    date: "",
    minPrice: "",
    maxPrice: "",
  });

  const [sortOption, setSortOption] = useState("");
  const [modalItem, setModalItem] = useState(null);
  const [categoryModalItem, setCategoryModalItem] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Category filters
  const [mainCategories, setMainCategories] = useState([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState([]);
  const [selectedMainCategory, setSelectedMainCategory] = useState("");
  const [selectedSubCategory, setSelectedSubCategory] = useState("");

  // Supplier + category data
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [allCategories, setAllCategories] = useState([]);

  // Price statistics
  const [priceStats, setPriceStats] = useState({
    min: 0,
    max: 0,
    avg: 0,
  });

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
        const items = res.data || [];
        const normalizedItems = items.map((item) => ({
          ...item,
          datePosted: item.datePosted || item.dateposted || null,
          dateUpdated: item.dateUpdated || item.dateupdated || item.date || null,
          effectiveUntil: item.effectiveUntil || item.effectiveuntil || null,
          date: item.date || item.dateUpdated || item.datePosted || null,
        }));
        setMarketItems(normalizedItems);
        
        // Calculate price statistics
        if (items.length > 0) {
          const prices = items.map(item => parseFloat(item.price) || 0).filter(p => p > 0);
          if (prices.length > 0) {
            setPriceStats({
              min: Math.min(...prices),
              max: Math.max(...prices),
              avg: prices.reduce((a, b) => a + b, 0) / prices.length,
            });
          } else {
            setPriceStats({ min: 0, max: 0, avg: 0 });
          }
        } else {
          setPriceStats({ min: 0, max: 0, avg: 0 });
        }
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

        const mappedSuppliers = (suppliersRes.data || [])
          .filter((s) => s && s.id != null && s.name)
          .map((s) => ({
            SupplierID: s.id,
            CompanyName: s.name,
            Address: s.location || s.Address,
            ContactNumber: s.ContactNumber,
            Email: s.email,
          }));
        
        setAllSuppliers(mappedSuppliers);

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

  const clearFilters = () => {
    setFilters({
      search: "",
      category: "",
      supplier: "",
      date: "",
      minPrice: "",
      maxPrice: "",
    });
    setSelectedMainCategory("");
    setSelectedSubCategory("");
    setSubCategoryOptions([]);
    setSortOption("");
  };

  const toggleBookmark = (item) => {
    if (bookmarks.find((b) => b.id === item.id)) {
      setBookmarks((prev) => prev.filter((b) => b.id !== item.id));
    } else {
      setBookmarks((prev) => [...prev, item]);
    }
  };

  // Apply client-side price range filtering and sorting
  const getFilteredAndSortedItems = (items) => {
    let filtered = [...items];

    // Client-side price range filtering (in case backend doesn't handle it)
    if (filters.minPrice) {
      const minPrice = parseFloat(filters.minPrice);
      filtered = filtered.filter(item => parseFloat(item.price) >= minPrice);
    }
    
    if (filters.maxPrice) {
      const maxPrice = parseFloat(filters.maxPrice);
      filtered = filtered.filter(item => parseFloat(item.price) <= maxPrice);
    }

    // Apply sorting
    if (sortOption) {
      const getSortTimestamp = (item) => {
        const source = getLatestActivityDate(item);
        if (!source) return 0;
        const parsed = dayjs(source);
        return parsed.isValid() ? parsed.valueOf() : 0;
      };

      switch (sortOption) {
        case "price-asc":
          filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
          break;
        case "price-desc":
          filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
          break;
        case "name-asc":
          filtered.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case "name-desc":
          filtered.sort((a, b) => b.name.localeCompare(a.name));
          break;
        case "date-newest":
          filtered.sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
          break;
        case "date-oldest":
          filtered.sort((a, b) => getSortTimestamp(a) - getSortTimestamp(b));
          break;
        default:
          break;
      }
    }

    return filtered;
  };

  const displayedItems = getFilteredAndSortedItems(showBookmarks ? bookmarks : marketItems);

  const modalEffectiveStatus = modalItem ? computeEffectiveStatus(modalItem.effectiveUntil) : null;
  const modalCategories =
    modalItem && modalItem.categories
      ? modalItem.categories
          .split(",")
          .map((cat) => cat.trim())
          .filter(Boolean)
      : [];
  const categoryModalCategories =
    categoryModalItem && categoryModalItem.categories
      ? categoryModalItem.categories
          .split(",")
          .map((cat) => cat.trim())
          .filter(Boolean)
      : [];

  // Count active filters (including sort)
  const activeFiltersCount = Object.values(filters).filter(v => v !== "").length + (sortOption ? 1 : 0);

  return (
    <div className="market-container">
      <div className="market-header">
        <div className="market-header-content">
          <span className="market-header-tagline">MSSS Admin Console</span>
          <div className="market-header-text">
            <h2>Market Survey &amp; Scoping</h2>
            <p className="market-header-description">
              Browse, filter, and review supplier offerings to support procurement planning.
            </p>
          </div>
        </div>
        <button
          className={`bookmark-view-btn ${showBookmarks ? "active" : ""}`}
          onClick={() => setShowBookmarks(!showBookmarks)}
        >
          ⭐ {showBookmarks ? "View All Items" : `View Bookmarked (${bookmarks.length})`}
        </button>
      </div>

      {/* PRICE STATISTICS - Only show when filters are active */}
      {!isLoading && marketItems.length > 0 && activeFiltersCount > 0 && (
        <div className="price-stats">
          <div className="stat-item">
            <span className="stat-label">Min Price:</span>
            <span className="stat-value">₱{priceStats.min.toLocaleString()}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Max Price:</span>
            <span className="stat-value">₱{priceStats.max.toLocaleString()}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg Price:</span>
            <span className="stat-value">
              ₱{isNaN(priceStats.avg) ? '0' : Math.round(priceStats.avg).toLocaleString()}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Items Found:</span>
            <span className="stat-value">{displayedItems.length}</span>
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="market-filter-section">
        <div className="filter-header">
          <h3>🔍 Filters {activeFiltersCount > 0 && `(${activeFiltersCount} active)`}</h3>
          <div className="filter-actions">
            <button
              className="toggle-filters-btn"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              {showAdvancedFilters ? "▲ Hide Advanced" : "▼ Show Advanced"}
            </button>
            {activeFiltersCount > 0 && (
              <button className="clear-filters-btn" onClick={clearFilters}>
                ✖ Clear All
              </button>
            )}
          </div>
        </div>

        <div className="market-filter-bar">
          {/* SEARCH */}
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

          {/* SUPPLIER */}
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

          {/* SORT BY */}
          <select
            name="sort"
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="market-sort-select"
          >
            <option value="">Sort By</option>
            <option value="price-asc">💰 Price: Low to High</option>
            <option value="price-desc">💰 Price: High to Low</option>
            <option value="name-asc">🔤 Name: A to Z</option>
            <option value="name-desc">🔤 Name: Z to A</option>
            <option value="date-newest">📅 Newest First</option>
            <option value="date-oldest">📅 Oldest First</option>
          </select>
        </div>

        {/* ADVANCED FILTERS */}
        {showAdvancedFilters && (
          <div className="advanced-filters">
            <div className="filter-row">
              {/* PRICE RANGE */}
              <div className="filter-group price-filter">
                <label>💰 Budget / Price Range</label>
                <div className="price-range-inputs">
                  <input
                    type="number"
                    name="minPrice"
                    placeholder="Min ₱"
                    value={filters.minPrice}
                    onChange={handleFilterChange}
                    className="price-input"
                    min="0"
                  />
                  <span className="price-separator">—</span>
                  <input
                    type="number"
                    name="maxPrice"
                    placeholder="Max ₱"
                    value={filters.maxPrice}
                    onChange={handleFilterChange}
                    className="price-input"
                    min="0"
                  />
                </div>
                <small className="filter-hint">
                  Enter your budget range to find items within your price limit
                </small>
              </div>

              {/* DATE */}
              <div className="filter-group date-filter">
                <label>📅 Updated Date</label>
                <input
                  type="date"
                  name="date"
                  value={filters.date}
                  onChange={handleFilterChange}
                  className="market-date-input"
                />
                <small className="filter-hint">
                  Filter by when items were last updated
                </small>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PRODUCT GRID */}
      <div className="market-grid">
        {isLoading ? (
          <p className="no-items">Loading products...</p>
        ) : displayedItems.length === 0 ? (
          <div className="no-items-container">
            <p className="no-items">
              {activeFiltersCount > 0 
                ? "No items found matching your filters." 
                : "No items available."}
            </p>
            {activeFiltersCount > 0 && (
              <button className="clear-filters-btn" onClick={clearFilters}>
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          displayedItems.map((item) => {
            const effectiveStatus = computeEffectiveStatus(item.effectiveUntil);
            const priceValue = Number(item.price ?? 0);
            const categories = (item.categories || "")
              .split(",")
              .map((cat) => cat.trim())
              .filter(Boolean);
            const previewCategories = categories.slice(0, 2).join(", ");
            const hasAdditionalCategories = categories.length > 2;

            return (
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
                  {categories.length > 0 && (
                    <p className="item-categories">
                      <strong>Categories:</strong>{" "}
                      <span className="category-list-text">{previewCategories}</span>
                      {hasAdditionalCategories && (
                        <button
                          type="button"
                          className="show-more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCategoryModalItem(item);
                          }}
                        >
                          View all
                        </button>
                      )}
                    </p>
                  )}
                  <p>
                    <strong>Supplier:</strong> {item.company}
                  </p>
                  {item.location && (
                    <p>
                      <strong>Location:</strong> {item.location}
                    </p>
                  )}
                  <p>
                    <strong>Unit:</strong> {item.unit}
                  </p>
                  <p className="item-updated">
                    <strong>Updated:</strong>{" "}
                    {formatDisplayDate(getLatestActivityDate(item))}
                  </p>
                </div>
                <div className="market-card-footer">
                  <div className={effectiveStatus.className}>
                    <span className={`market-effective-pill ${effectiveStatus.badgeClass}`}>
                      {effectiveStatus.label}
                    </span>
                    <span className="market-effective-message">{effectiveStatus.message}</span>
                  </div>
                  <p className="item-price">
                    <strong>₱{priceValue.toLocaleString()}</strong>
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
            );
          })
        )}
      </div>

      {/* ITEM MODAL */}
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
            {modalCategories.length > 0 && (
              <div className="modal-info-row">
                <strong>Categories:</strong>
                <p className="modal-categories-text">
                  {modalCategories.join(", ")}
                </p>
              </div>
            )}
            <p>
              <strong>Supplier:</strong> {modalItem.company}
            </p>
            <p>
              <strong>Updated:</strong>{" "}
              {formatDisplayDateTime(getLatestActivityDate(modalItem))}
            </p>
            <p>
              <strong>Unit:</strong> {modalItem.unit}
            </p>
            <p>
              <strong>Price:</strong> ₱{Number(modalItem.price ?? 0).toLocaleString()}
            </p>
            <p>
              <strong>Stock:</strong> {modalItem.stock}
            </p>
            {modalItem.location && (
              <p>
                <strong>Location:</strong> {modalItem.location}
              </p>
            )}
            {modalEffectiveStatus && (
              <p>
                <strong>Effective Window:</strong>{" "}
                {modalEffectiveStatus.hasDate
                  ? `${modalEffectiveStatus.formattedDate} — ${modalEffectiveStatus.message}`
                  : modalEffectiveStatus.message}
              </p>
            )}
            <button
              className="bookmark-btn modal-bookmark"
              onClick={() => toggleBookmark(modalItem)}
            >
              ⭐ {bookmarks.find((b) => b.id === modalItem.id) ? "Remove from" : "Add to"} Bookmark
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
            {categoryModalCategories.length > 0 ? (
              <ul className="modal-category-list">
                {categoryModalCategories.map((cat, idx) => (
                  <li key={idx}>{cat}</li>
                ))}
              </ul>
            ) : (
              <p className="modal-categories-text">No categories listed.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Market;