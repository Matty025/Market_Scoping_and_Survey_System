import React, { useState, useMemo, useEffect, useCallback } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import Pagination from "../../components/Pagination";
import "./Market.css";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublicBucket = import.meta.env.VITE_SUPABASE_PUBLIC_BUCKET || "public";

const buildPublicLogoUrl = (logoPath) => {
  if (!logoPath || !supabaseUrl) return logoPath || null;
  if (/^https?:\/\//i.test(logoPath)) return logoPath;
  const cleaned = logoPath.replace(/^\/+/, "");
  const parts = cleaned.split("/");
  const bucket = parts.length > 1 ? parts[0] : supabasePublicBucket;
  const key = parts.length > 1 ? parts.slice(1).join("/") : cleaned;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;
};

const Market = () => {
  const { token } = useAuth();

  const [categoryGroups] = useState({
    GOODS: [
      "Office Supplies & Devices",
      "IT Equipment & Peripherals",
      "Educational & Instructional Materials",
      "Furniture & Fixtures",
      "Sports & Physical Education Equipment",
      "Laboratory Equipment & Supplies",
      "Electrical & Electronic Supplies",
      "Cleaning & Janitorial Supplies",
      "Medical & First Aid Supplies",
      "Vehicles, Tools & Machinery",
      "Printing & Reproduction Services",
      "Uniforms, Apparel & Fabrics",
      "Food & Catering Supplies",
      "General Support Services",
    ],
    INFRASTRUCTURE_PROJECTS: [
      "School Building Construction",
      "School Building Rehabilitation",
      "Water Supply & Sanitation Systems",
      "Electrical & Power Systems",
      "Site Development & Landscaping",
      "Roofing and Painting Works",
      "Minor Repairs & Maintenance Work",
    ],
    CONSULTING_SERVICES: [
      "Architectural & Engineering Design",
      "Feasibility & Project Studies",
      "Construction Supervision",
      "ICT System Development",
      "Research & Evaluation Studies",
    ],
  });

  const [marketItems, setMarketItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedSupplier, setSelectedSupplier] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [modalItem, setModalItem] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [cart, setCart] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [cartFilter, setCartFilter] = useState("All");
  const [selectedCheckout, setSelectedCheckout] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const buildParams = useCallback(() => {
    const params = {};
    if (searchQuery) params.search = searchQuery;
    if (selectedCategory && selectedCategory !== "All") params.category = selectedCategory;
    if (selectedSupplier && selectedSupplier !== "All") params.supplier = selectedSupplier;
    if (dateFilter) params.date = dateFilter;
    return params;
  }, [searchQuery, selectedCategory, selectedSupplier, dateFilter]);

  const fetchMarketItems = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const res = await api.get("/api/buyer/market-items", {
        headers: { Authorization: `Bearer ${token}` },
        params: buildParams(),
      });
      const items = res.data || [];
      const normalized = items.map((it) => {
        const cats = (it.categories || "").split(",").map((c) => c.trim()).filter(Boolean);
        return {
          id: it.id,
          product: it.name || "",
          description: it.description || "",
          category: cats[0] || "Uncategorized",
          categories: cats,
          company: it.company || "",
          logo: it.logoUrl || it.logo || it.logo_url || it.companyLogo || it.logoURL || null,
          updated: it.date || it.dateUpdated || it.datePosted || null,
          unit: it.unit || "",
          price: Number(it.price) || 0,
          stock: it.stock ?? null,
          location: it.location || null,
          effectiveUntil: it.effectiveUntil || null,
        };
      });
      setMarketItems(normalized);
    } catch (err) {
      console.error("[Buyer Market] fetchMarketItems error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [token, buildParams]);

  const fetchMarketStats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get("/api/buyer/market-stats", {
        headers: { Authorization: `Bearer ${token}` },
        params: buildParams(),
      });
      setSummary(res.data?.summary || null);
    } catch (err) {
      console.error("[Buyer Market] fetchMarketStats error:", err);
    }
  }, [token, buildParams]);

  useEffect(() => {
    fetchMarketItems();
    fetchMarketStats();
  }, [fetchMarketItems, fetchMarketStats]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, selectedSupplier, dateFilter, showBookmarks, showCart]);

  const suppliers = useMemo(() => ["All", ...Array.from(new Set(marketItems.map((i) => i.company).filter(Boolean)))], [marketItems]);

  const sourceItems = showBookmarks ? bookmarks : showCart ? cart : marketItems;

  const filteredItems = useMemo(() => {
    return sourceItems.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        item.product.toLowerCase().includes(q) ||
        item.company.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
      const matchesSupplier = selectedSupplier === "All" || item.company === selectedSupplier;
      const matchesDate = !dateFilter || (item.updated && item.updated.startsWith && item.updated.startsWith(dateFilter));
      return matchesSearch && matchesCategory && matchesSupplier && matchesDate;
    });
  }, [searchQuery, selectedCategory, selectedSupplier, dateFilter, sourceItems]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const currentPageItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleBookmark = (item) => {
    if (bookmarks.find((b) => b.id === item.id)) {
      setBookmarks((prev) => prev.filter((b) => b.id !== item.id));
    } else {
      setBookmarks((prev) => [...prev, item]);
    }
  };

  const toggleCart = (item) => {
    if (cart.find((c) => c.id === item.id)) {
      setCart((prev) => prev.filter((c) => c.id !== item.id));
    } else {
      setCart((prev) => [...prev, { ...item, quantity: 1 }]);
    }
  };

  const handleQuantityChange = (item, qty) => {
    setCart((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, quantity: Math.max(1, qty) } : c))
    );
  };

  const handleCheckoutSelect = (item) => {
    if (selectedCheckout.includes(item.id)) {
      setSelectedCheckout((prev) => prev.filter((p) => p !== item.id));
    } else {
      setSelectedCheckout((prev) => [...prev, item.id]);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("All");
    setSelectedSupplier("All");
    setDateFilter("");
  };

  const downloadCSV = () => {
    let itemsToExport = cart.filter((i) => selectedCheckout.includes(i.id));
    if (itemsToExport.length === 0) itemsToExport = cart;
    const sorted = [...itemsToExport].sort((a, b) => a.company.localeCompare(b.company));

    const csvContent = [
      ["Supplier", "Category", "Product", "Quantity", "Unit", "Price", "Total"],
      ...sorted.map((i) => [i.company, i.category, i.product, i.quantity, i.unit, i.price, i.price * i.quantity]),
    ]
      .map((e) => e.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `checkout_${new Date().toISOString().split("T")[0]}.csv`);
    link.click();
  };

  const filteredCart = cartFilter === "All" ? cart : cart.filter((item) => item.company === cartFilter);

  return (
    <div className="market-container">
      <div className="market-header">
        <h2>🛒 Market</h2>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className={`bookmark-view-btn ${showBookmarks ? "active" : ""}`}
            onClick={() => {
              setShowBookmarks(!showBookmarks);
              setShowCart(false);
            }}
          >
            ⭐ {showBookmarks ? "View All Items" : `View Bookmarked (${bookmarks.length})`}
          </button>
          <button
            className={`bookmark-view-btn ${showCart ? "active" : ""}`}
            onClick={() => {
              setShowCart(!showCart);
              setShowBookmarks(false);
            }}
          >
            🛍️ {showCart ? "View All Items" : `View Cart (${cart.length})`}
          </button>
        </div>
      </div>

      <p>Browse and survey available products from suppliers.</p>

      {/* Summary stats */}
      {summary && (
        <div className="price-stats">
          <div className="stat-item">
            <span className="stat-label">Items:</span>
            <span className="stat-value">{summary.totalItems}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Min Price:</span>
            <span className="stat-value">{summary.minPrice ? `₱${Number(summary.minPrice).toLocaleString()}` : 'N/A'}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Max Price:</span>
            <span className="stat-value">{summary.maxPrice ? `₱${Number(summary.maxPrice).toLocaleString()}` : 'N/A'}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Avg Price:</span>
            <span className="stat-value">{summary.avgPrice ? `₱${Math.round(summary.avgPrice).toLocaleString()}` : 'N/A'}</span>
          </div>
        </div>
      )}

      {!showCart ? (
        <>
          <div className="market-filter-bar">
            <input type="text" placeholder="Search by product or supplier..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="market-search-input" />

            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="market-category-select">
              <option value="All">All Categories</option>
              {Object.entries(categoryGroups).map(([group, categories]) => (
                <optgroup key={group} label={group.replace(/_/g, " ")}>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="market-supplier-select">
              {suppliers.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="market-date-input" />
            <button className="see-more-btn" type="button" onClick={clearFilters} title="Clear filters">Clear</button>
          </div>

          {filteredItems.length > 0 && (
            <div className="pagination-wrapper top">
              <div className="pagination-summary">Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length}</div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                previewCount={7}
              />
            </div>
          )}

          <div className="market-grid">
            {isLoading ? (
              <div className="market-loading">
                <span className="loading-spinner" aria-hidden="true" />
                <p>Loading products...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="no-items">No items found.</p>
            ) : (
              currentPageItems.map((item) => {
                const isBookmarked = bookmarks.some((b) => b.id === item.id);
                const isInCart = cart.some((c) => c.id === item.id);
                const logoSrc = buildPublicLogoUrl(item.logo);
                const logoInitial = (item.company || item.product || "?").charAt(0).toUpperCase();
                return (
                  <div key={item.id} className="market-card" onClick={() => setModalItem(item)}>
                    <div className="market-card-header">
                      <div className={`market-logo ${logoSrc ? "" : "fallback"}`} aria-hidden>
                        {logoSrc ? (
                          <img
                            src={logoSrc}
                            alt=""
                            role="button"
                            onClick={(e) => { e.stopPropagation(); setLogoPreview(logoSrc); }}
                            onError={(e) => {
                              const el = e.currentTarget.closest('.market-logo');
                              if (el) el.classList.add('fallback');
                            }}
                          />
                        ) : null}
                        <span>{logoInitial}</span>
                      </div>
                      <div className="market-card-title">
                        <h4>{item.product}</h4>
                        <p className="market-supplier-name">{item.company}</p>
                      </div>
                    </div>
                    {item.description && (
                      <p className="market-desc">{item.description.length > 140 ? `${item.description.slice(0, 140)}...` : item.description}</p>
                    )}
                    <p><strong>₱{Number(item.price).toLocaleString()}</strong></p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <button className={`bookmark-btn ${isBookmarked ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); toggleBookmark(item); }}>
                        ⭐ {isBookmarked ? "Bookmarked" : "Bookmark"}
                      </button>
                      <button className={`bookmark-btn ${isInCart ? "active" : ""}`} onClick={(e) => { e.stopPropagation(); toggleCart(item); }}>
                        🛒 {isInCart ? "In Cart" : "Add to Cart"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {filteredItems.length > 0 && (
            <div className="pagination-wrapper">
              <div className="pagination-summary">Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length}</div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                previewCount={7}
              />
            </div>
          )}
        </>
      ) : (
        <div className="cart-container">
          <h3>🛍️ Your Cart</h3>
          <select value={cartFilter} onChange={(e) => setCartFilter(e.target.value)} className="market-supplier-select">
            <option value="All">All Suppliers</option>
            {[...new Set(cart.map((item) => item.company))].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {filteredCart.length === 0 ? (
            <p className="no-items">Your cart is empty.</p>
          ) : (
            <table className="cart-table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Supplier</th>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredCart.sort((a, b) => a.company.localeCompare(b.company)).map((item, i) => (
                  <tr key={i}>
                    <td>
                      <input type="checkbox" checked={selectedCheckout.includes(item.id)} onChange={() => handleCheckoutSelect(item)} />
                    </td>
                    <td>{item.company}</td>
                    <td>{item.product}</td>
                    <td>{item.category}</td>
                    <td>
                      <input type="number" min="1" value={item.quantity} onChange={(e) => handleQuantityChange(item, parseInt(e.target.value) || 1)} className="qty-input" />
                    </td>
                    <td>{item.unit}</td>
                    <td>₱{Number(item.price).toLocaleString()}</td>
                    <td>₱{(Number(item.price) * item.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filteredCart.length > 0 && (
            <button className="checkout-btn" onClick={downloadCSV}>✅ Purchase Request(Download CSV)</button>
          )}
        </div>
      )}

      {modalItem && (
        <div className="market-modal" onClick={() => setModalItem(null)}>
          <div className="market-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setModalItem(null)}>✖</button>
            <h2>{modalItem.product}</h2>
            {modalItem.description && (
              <p className="market-modal-desc"><strong>Description:</strong> {modalItem.description}</p>
            )}
            <p><strong>Supplier:</strong> {modalItem.company}</p>
            <p><strong>Categories:</strong> {modalItem.categories.join(', ')}</p>
            <p><strong>Updated:</strong> {modalItem.updated ? new Date(modalItem.updated).toLocaleString() : 'N/A'}</p>
            <p><strong>Unit:</strong> {modalItem.unit}</p>
            <p><strong>Price:</strong> ₱{Number(modalItem.price).toLocaleString()}</p>
            <p><strong>Stock:</strong> {modalItem.stock ?? 'N/A'}</p>
            {modalItem.location && <p><strong>Location:</strong> {modalItem.location}</p>}
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="bookmark-btn modal-bookmark" onClick={() => toggleBookmark(modalItem)}>
                ⭐ {bookmarks.some((b) => b.id === modalItem.id) ? "Bookmarked" : "Add to Bookmark"}
              </button>
              <button className="bookmark-btn modal-bookmark" onClick={() => toggleCart(modalItem)}>
                🛒 {cart.some((c) => c.id === modalItem.id) ? "In Cart" : "Add to Cart"}
              </button>
            </div>
          </div>
        </div>
      )}

      {logoPreview && (
        <div className="logo-preview-overlay" onClick={() => setLogoPreview(null)}>
          <div className="logo-preview" onClick={(e) => e.stopPropagation()}>
            <button className="logo-preview-close" onClick={() => setLogoPreview(null)} aria-label="Close image">✖</button>
            <img src={logoPreview} alt="Supplier logo" />
          </div>
        </div>
      )}
    </div>
  );
};

export default Market;
