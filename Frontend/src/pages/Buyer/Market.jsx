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
  const [cart, setCart] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [cartFilter, setCartFilter] = useState("All");
  const [selectedCheckout, setSelectedCheckout] = useState([]);

  const suppliers = useMemo(
    () => ["All", ...new Set(marketItems.map((item) => item.company))],
    [marketItems]
  );

  const sourceItems = showBookmarks ? bookmarks : showCart ? cart : marketItems;

  const filteredItems = useMemo(() => {
    return sourceItems.filter((item) => {
      const matchesSearch =
        item.product.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.company.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" || item.category === selectedCategory;
      const matchesSupplier =
        selectedSupplier === "All" || item.company === selectedSupplier;
      const matchesDate = !dateFilter || item.updated === dateFilter;
      return matchesSearch && matchesCategory && matchesSupplier && matchesDate;
    });
  }, [
    searchQuery,
    selectedCategory,
    selectedSupplier,
    dateFilter,
    sourceItems,
  ]);

  const toggleBookmark = (item) => {
    if (bookmarks.find((b) => b.product === item.product && b.company === item.company)) {
      setBookmarks((prev) => prev.filter((b) => b.product !== item.product));
    } else {
      setBookmarks((prev) => [...prev, item]);
    }
  };

  const toggleCart = (item) => {
    if (cart.find((c) => c.product === item.product && c.company === item.company)) {
      setCart((prev) => prev.filter((c) => c.product !== item.product));
    } else {
      setCart((prev) => [...prev, { ...item, quantity: 1 }]);
    }
  };

  const handleQuantityChange = (item, qty) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product === item.product && c.company === item.company
          ? { ...c, quantity: Math.max(1, qty) }
          : c
      )
    );
  };

  const handleCheckoutSelect = (item) => {
    if (selectedCheckout.includes(item.product)) {
      setSelectedCheckout((prev) => prev.filter((p) => p !== item.product));
    } else {
      setSelectedCheckout((prev) => [...prev, item.product]);
    }
  };

  const downloadCSV = () => {
    let itemsToExport = cart.filter((i) => selectedCheckout.includes(i.product));
    if (itemsToExport.length === 0) itemsToExport = cart;
    const sorted = [...itemsToExport].sort((a, b) => a.company.localeCompare(b.company));

    const csvContent = [
      ["Supplier", "Category", "Product", "Quantity", "Unit", "Price", "Total"],
      ...sorted.map(i => [
        i.company,
        i.category,
        i.product,
        i.quantity,
        i.unit,
        i.price,
        i.price * i.quantity
      ]),
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `checkout_${new Date().toISOString().split("T")[0]}.csv`);
    link.click();
  };

  const filteredCart = cartFilter === "All"
    ? cart
    : cart.filter((item) => item.company === cartFilter);

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
            ⭐ {showBookmarks ? "View All Items" : "View Bookmarked"}
          </button>
          <button
            className={`bookmark-view-btn ${showCart ? "active" : ""}`}
            onClick={() => {
              setShowCart(!showCart);
              setShowBookmarks(false);
            }}
          >
            🛍️ {showCart ? "View All Items" : "View Cart"}
          </button>
        </div>
      </div>
      <p>Browse and survey available products from suppliers.</p>

      {!showCart ? (
        <>
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

          <div className="market-grid">
            {filteredItems.length === 0 ? (
              <p className="no-items">No items found.</p>
            ) : (
              filteredItems.map((item, index) => {
                const isBookmarked = bookmarks.some(
                  (b) => b.product === item.product && b.company === item.company
                );
                const isInCart = cart.some(
                  (c) => c.product === item.product && c.company === item.company
                );
                return (
                  <div key={index} className="market-card" onClick={() => setModalItem(item)}>
                    <h4>{item.product}</h4>
                    <p><strong>Supplier:</strong> {item.company}</p>
                    <p><strong>₱{item.price.toLocaleString()}</strong></p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <button
                        className={`bookmark-btn ${isBookmarked ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmark(item);
                        }}
                      >
                        ⭐ {isBookmarked ? "Bookmarked" : "Bookmark"}
                      </button>
                      <button
                        className={`bookmark-btn ${isInCart ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCart(item);
                        }}
                      >
                        🛒 {isInCart ? "In Cart" : "Add to Cart"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="cart-container">
          <h3>🛍️ Your Cart</h3>
          <select
            value={cartFilter}
            onChange={(e) => setCartFilter(e.target.value)}
            className="market-supplier-select"
          >
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
                      <input
                        type="checkbox"
                        checked={selectedCheckout.includes(item.product)}
                        onChange={() => handleCheckoutSelect(item)}
                      />
                    </td>
                    <td>{item.company}</td>
                    <td>{item.product}</td>
                    <td>{item.category}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(item, parseInt(e.target.value))}
                        className="qty-input"
                      />
                    </td>
                    <td>{item.unit}</td>
                    <td>₱{item.price.toLocaleString()}</td>
                    <td>₱{(item.price * item.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filteredCart.length > 0 && (
            <button className="checkout-btn" onClick={downloadCSV}>
              ✅ Purchase Request(Download CSV)
            </button>
          )}
        </div>
      )}

      {modalItem && (
        <div className="market-modal" onClick={() => setModalItem(null)}>
          <div className="market-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setModalItem(null)}>✖</button>
            <h2>{modalItem.product}</h2>
            <p><strong>Supplier:</strong> {modalItem.company}</p>
            <p><strong>Category:</strong> {modalItem.category}</p>
            <p><strong>Updated:</strong> {modalItem.updated}</p>
            <p><strong>Unit:</strong> {modalItem.unit}</p>
            <p><strong>Price:</strong> ₱{modalItem.price.toLocaleString()}</p>
            <p><strong>Stock:</strong> {modalItem.stock}</p>
            <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
              <button className="bookmark-btn modal-bookmark" onClick={() => toggleBookmark(modalItem)}>
                ⭐ {bookmarks.some((b) => b.product === modalItem.product) ? "Bookmarked" : "Add to Bookmark"}
              </button>
              <button className="bookmark-btn modal-bookmark" onClick={() => toggleCart(modalItem)}>
                🛒 {cart.some((c) => c.product === modalItem.product) ? "In Cart" : "Add to Cart"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Market;
