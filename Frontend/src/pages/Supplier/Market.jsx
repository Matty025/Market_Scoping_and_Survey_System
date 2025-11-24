import React, { useState, useEffect } from "react";
import "./Market.css";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import AddProductForm from "./AddProductForm"; // We'll reuse this for adding/editing
import Toast from "../../components/Toast";

const backendBase = "http://localhost:3001";

const SupplierMarket = () => {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("date-desc"); // Default sort
  const [editingProduct, setEditingProduct] = useState(null); // For editing
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });

  // Fetch products from the backend
  const fetchProducts = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${backendBase}/api/supplier-files/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(res.data || []);
    } catch (err) {
      console.error("Failed to fetch products", err);
      setToast({ visible: true, message: "Could not load your products.", type: "error" });
    }
  };

  // Fetch categories for the filter dropdown
  const fetchCategories = async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${backendBase}/api/supplier-files/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(res.data || []);
    } catch (err) {
      console.error("Failed to fetch categories", err);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Handle Delete
  const handleDelete = async (productId) => {
    if (!window.confirm("Are you sure you want to delete this product? This action will be logged.")) {
      return;
    }
    try {
      await axios.delete(`${backendBase}/api/supplier-files/items/${productId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setToast({ visible: true, message: "Product deleted successfully.", type: "success" });
      fetchProducts(); // Refresh the product list
    } catch (err) {
      console.error("Delete failed", err);
      setToast({ visible: true, message: `Delete failed: ${err.response?.data?.message || err.message}`, type: "error" });
    }
  };

  // Handle Edit
  const handleEdit = (product) => {
    // We will implement the edit modal in a future step. For now, this opens the modal.
    setEditingProduct(product);
    setShowAddModal(true);
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setEditingProduct(null);
    fetchProducts(); // Always refetch data when the modal closes
  };

  // Filter logic
  const processedProducts = products
    .filter((product) => {
      const searchMatch =
        product.name.toLowerCase().includes(search.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(search.toLowerCase()));

      // Check if the product's category list includes the filtered category ID
      const categoryMatch =
        !categoryFilter || (product.categories && product.categories.includes(parseInt(categoryFilter, 10)));

      return searchMatch && categoryMatch;
    })
    .sort((a, b) => {
      const [sortField, sortOrder] = sortBy.split('-');
      const order = sortOrder === 'asc' ? 1 : -1;

      switch (sortField) {
        case 'name':
          return a.name.localeCompare(b.name) * order;
        case 'price':
          return (a.price - b.price) * order;
        case 'date':
          // Ensure dates are compared correctly
          return (new Date(a.date) - new Date(b.date)) * order;
        default:
          return 0;
      }
    });



  return (
    <div className="supplier-market">
      {/* Header */}
      <header className="market-header">
        <h2>🛍️ Supplier Market</h2>
        <p>View, add, and manage all your products listed in the market.</p>
      </header>

      <div className="market-actions">
        <button className="upload-btn" onClick={() => setShowAddModal(true)}>
          + Add Product Manually
        </button>
        <button
          className="upload-btn"
          onClick={() => navigate("/supplier/upload-products")}
        >
          📁 Bulk Upload from File
        </button>
      </div>

      {/* Search and Filter Bar */}
      <div className="market-controls">
        <input
          type="text"
          placeholder="Search by product name or description..."
          className="search-bar"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.CategoryID} value={cat.CategoryID}>
              {cat.CategoryName}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="date-desc">Sort by: Newest</option>
          <option value="date-asc">Sort by: Oldest</option>
          <option value="price-desc">Sort by: Price (High to Low)</option>
          <option value="price-asc">Sort by: Price (Low to High)</option>
          <option value="name-asc">Sort by: Name (A-Z)</option>
          <option value="name-desc">Sort by: Name (Z-A)</option>
        </select>
      </div>

      {/* Product Card Grid */}
      <div className="product-grid-container">
        {processedProducts.length > 0 ? (
          processedProducts.map((product) => (
            <div key={product.id} className="product-card">
              <div className="card-header">
                <h3>{product.name}</h3>
                <div className="card-actions">
                  <button className="btn-edit" onClick={() => handleEdit(product)}>Edit</button>
                  <button className="btn-delete" onClick={() => handleDelete(product.id)}>Delete</button>
                </div>
              </div>
              <div className="card-body">
                <p className="card-description">{product.description || 'No description provided.'}</p>
                <div className="card-details-grid">
                  <div className="detail-item"><span>🛍️</span> <strong>Price:</strong> ₱{product.price.toLocaleString()}</div>
                  <div className="detail-item">
                    <span>📦</span>
                    <strong>Stock:</strong>
                    <span className={`stock-badge ${
                      product.stock === 0 ? 'stock-out' :
                      product.stock <= 10 ? 'stock-low' : 'stock-ok'
                    }`}>
                      {product.stock === 0 ? 'Out of Stock' : 
                       product.stock <= 10 ? `Low (${product.stock})` : 
                       product.stock
                      }
                    </span>
                  </div>
                  <div className="detail-item"><span>📐</span> <strong>Unit:</strong> {product.unit}</div>
                  <div className="detail-item"><span>📍</span> <strong>Location:</strong> {product.location}</div>
                </div>
                <div className="card-categories">
                  <strong>Categories:</strong>
                  <div className="tags-container">
                    {/* --- FIX: Display the category names string directly from the backend --- */}
                    {product.categoryNames && product.categoryNames !== 'N/A'
                      ? product.categoryNames.split(', ').map(name => <span key={name} className="category-tag">{name}</span>)
                      : <span className="category-tag-na">N/A</span>
                    }
                  </div>
                </div>
              </div>
              <div className="card-footer">
                <span>
                  Posted: {new Date(product.date).toLocaleDateString("en-US", {
                    year: 'numeric', month: 'short', day: 'numeric'
                  })}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="no-results-card">
            No matching products found.
          </div>
        )}
      </div>

      {/* Re-using the AddProductForm for both Add and Edit */}
      {showAddModal && (
        <AddProductForm onClose={handleModalClose} onCreated={fetchProducts} productToEdit={editingProduct} />
      )}

      <Toast visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, visible: false })} />
    </div>
  );
};

export default SupplierMarket;
