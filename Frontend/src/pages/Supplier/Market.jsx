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

  useEffect(() => {
    fetchProducts();
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
  const filteredProducts = products.filter((product) => {
    return (
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      (product.description && product.description.toLowerCase().includes(search.toLowerCase()))
    );
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
      </div>

      {/* Product Table */}
      <div className="table-container">
        <table className="market-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Description</th>
              <th>Unit</th>
              <th>Price (₱)</th>
              <th>Date Posted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td className="description-cell">{product.description}</td>
                  <td>{product.unit}</td>
                  <td>₱{product.price.toLocaleString()}</td>
                  <td>{new Date(product.date).toLocaleDateString("en-US", {
                      year: 'numeric', month: 'short', day: 'numeric'
                  })}</td>
                  <td className="actions-cell">
                    <button className="btn-edit" onClick={() => handleEdit(product)}>Edit</button>
                    <button className="btn-delete" onClick={() => handleDelete(product.id)}>Delete</button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="no-results">
                  No matching products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
