import React, { useState, useMemo } from "react";
import "./Market.css";

const Market = () => {
    const categoryGroups = {
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
      "General Support Services"
    ],
    INFRASTRUCTURE_PROJECTS: [
      "School Building Construction",
      "School Building Rehabilitation",
      "Water Supply & Sanitation Systems",
      "Electrical & Power Systems",
      "Site Development & Landscaping",
      "Roofing and Painting Works",
      "Minor Repairs & Maintenance Work"
    ],
    CONSULTING_SERVICES: [
      "Architectural & Engineering Design",
      "Feasibility & Project Studies",
      "Construction Supervision",
      "ICT System Development",
      "Research & Evaluation Studies"
    ],





  };

  const marketItems = [
    { company: "ABC Supplies", category: "Office Supplies & Devices", product: "Laptop", updated: "Nov 01, 2025", unit: "pcs", price: 50000, stock: 15 },
    { company: "Tech Solutions", category: "IT Equipment & Peripherals", product: "Printer", updated: "Nov 02, 2025", unit: "pcs", price: 12000, stock: 10 },
    { company: "Furniture World", category: "Furniture & Fixtures", product: "Office Desk", updated: "Nov 03, 2025", unit: "pcs", price: 9500, stock: 5 },
    { company: "Lab Equip Co.", category: "Laboratory Equipment & Supplies", product: "Microscope", updated: "Nov 05, 2025", unit: "pcs", price: 15000, stock: 3 },
    { company: "Sporty Ltd.", category: "Sports & Physical Education Equipment", product: "Basketball", updated: "Nov 04, 2025", unit: "pcs", price: 1200, stock: 20 },
  ];

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedSupplier, setSelectedSupplier] = useState("All");
  const [dateFilter, setDateFilter] = useState("");
  const [modalItem, setModalItem] = useState(null);
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  const suppliers = useMemo(() => ["All", ...new Set(marketItems.map((item) => item.company))], [marketItems]);

  const filteredItems = useMemo(() => {
    const source = showBookmarks ? bookmarks : marketItems;
    return source.filter((item) => {
      const matchesSearch =
        item.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.company.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
      const matchesSupplier = selectedSupplier === "All" || item.company === selectedSupplier;
      const matchesDate = !dateFilter || item.updated === dateFilter;
      return matchesSearch && matchesCategory && matchesSupplier && matchesDate;
    });
  }, [searchQuery, selectedCategory, selectedSupplier, dateFilter, marketItems, bookmarks, showBookmarks]);

  const toggleBookmark = (item) => {
    if (bookmarks.find((b) => b.product === item.product && b.company === item.company)) {
      setBookmarks((prev) => prev.filter((b) => b.product !== item.product));
    } else {
      setBookmarks((prev) => [...prev, item]);
    }
  };

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

      {/* Filters */}
      <div className="market-filter-bar">
        <input
          type="text"
          placeholder="Search by product or supplier..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="market-search-input"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="market-category-select"
        >
          <option value="All">All Categories</option>
          {Object.entries(categoryGroups).map(([group, categories]) => (
            <optgroup key={group} label={group.replace(/_/g, " ")}>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={selectedSupplier}
          onChange={(e) => setSelectedSupplier(e.target.value)}
          className="market-supplier-select"
        >
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="market-date-input"
        />
      </div>

      {/* Product Grid */}
      <div className="market-grid">
        {filteredItems.length === 0 ? (
          <p className="no-items">No items found.</p>
        ) : (
          filteredItems.map((item, index) => (
            <div key={index} className="market-card" onClick={() => setModalItem(item)}>
              <h4>{item.product}</h4>
              <p>
                <strong>Supplier:</strong> {item.company}
              </p>
              <p>
                <strong>₱{item.price.toLocaleString()}</strong>
              </p>
              <button
                className={`bookmark-btn ${
                  bookmarks.find((b) => b.product === item.product) ? "active" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBookmark(item);
                }}
              >
                ⭐ {bookmarks.find((b) => b.product === item.product) ? "Bookmarked" : "Bookmark"}
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
            <h2>{modalItem.product}</h2>
            <p>
              <strong>Supplier:</strong> {modalItem.company}
            </p>
            <p>
              <strong>Category:</strong> {modalItem.category}
            </p>
            <p>
              <strong>Updated:</strong> {modalItem.updated}
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
