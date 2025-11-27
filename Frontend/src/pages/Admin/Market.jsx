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
        setMarketItems(items);
        
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
          filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
          break;
        case "date-oldest":
          filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
          break;
        default:
          break;
      }
    }

    return filtered;
  };

  const displayedItems = getFilteredAndSortedItems(showBookmarks ? bookmarks : marketItems);

  // Count active filters (including sort)
  const activeFiltersCount = Object.values(filters).filter(v => v !== "").length + (sortOption ? 1 : 0);

  return (
    <div className="market-container">
      <div className="market-header">
        <h2>🛒 Market Survey & Scoping</h2>
        <button
          className={`bookmark-view-btn ${showBookmarks ? "active" : ""}`}
          onClick={() => setShowBookmarks(!showBookmarks)}
        >
          ⭐ {showBookmarks ? "View All Items" : `View Bookmarked (${bookmarks.length})`}
        </button>
      </div>
      <p>Browse, filter, and survey available products from suppliers.</p>

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