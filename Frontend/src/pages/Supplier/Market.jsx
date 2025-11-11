import React, { useState } from "react";
import "./Market.css";
import { useNavigate } from "react-router-dom";

const SupplierMarket = () => {
  const navigate = useNavigate(); // ✅ Moved inside the component

  // ✅ Sample data (replace with backend data later)
  const [products] = useState([
    {
      id: 1,
      type: "Electronics",
      description: "15-inch Laptop with 8GB RAM and 256GB SSD",
      unit: "Piece",
      price: 35000,
      date: "2025-11-01",
    },
    {
      id: 2,
      type: "Furniture",
      description: "Wooden Study Table",
      unit: "Piece",
      price: 2500,
      date: "2025-11-05",
    },
    {
      id: 3,
      type: "School Supplies",
      description: "Ballpen (Blue Ink)",
      unit: "Box (12 pcs)",
      price: 120,
      date: "2025-11-07",
    },
    {
      id: 4,
      type: "Electronics",
      description: "Projector with HDMI and VGA support",
      unit: "Set",
      price: 15000,
      date: "2025-11-09",
    },
  ]);

  // ✅ State for search and filters
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState([]);

  // ✅ Extract unique types for dropdown filter
  const allTypes = [...new Set(products.map((p) => p.type))];

  // ✅ Handle checkbox toggle
  const toggleType = (type) => {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // ✅ Filter logic
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.description.toLowerCase().includes(search.toLowerCase()) ||
      product.type.toLowerCase().includes(search.toLowerCase());

    const matchesType =
      selectedTypes.length === 0 || selectedTypes.includes(product.type);

    return matchesSearch && matchesType;
  });

  // ✅ Dropdown toggle state
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="supplier-market">
      {/* Header */}
      <header className="market-header">
        <h2>🛍️ Supplier Market</h2>
        <p>Manage and view all your products listed in the market.</p>
      </header>

      <div className="market-actions">
        <button
          className="upload-btn"
          onClick={() => navigate("/supplier/upload-products")}
        >
          📁 Upload Product File
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="market-controls">
        <input
          type="text"
          placeholder="Search by type or description..."
          className="search-bar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="dropdown-container">
          <button
            className="dropdown-toggle"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            Filter by Type ▾
          </button>
          {dropdownOpen && (
            <div className="dropdown-menu">
              {allTypes.map((type) => (
                <label key={type} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() => toggleType(type)}
                  />
                  {type}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product Table */}
      <div className="table-container">
        <table className="market-table">
          <thead>
            <tr>
              <th>Product Type</th>
              <th>Description</th>
              <th>Unit</th>
              <th>Price (₱)</th>
              <th>Date Posted</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>{product.type}</td>
                  <td>{product.description}</td>
                  <td>{product.unit}</td>
                  <td>₱{product.price.toLocaleString()}</td>
                  <td>
                    {new Date(product.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="no-results">
                  No matching products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SupplierMarket;
