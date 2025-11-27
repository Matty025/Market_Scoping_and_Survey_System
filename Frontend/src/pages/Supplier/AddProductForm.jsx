import React, { useState, useEffect } from "react";
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
// 💡 FIX 1: Import the standard toast utility object from the library
import toast from 'react-hot-toast'; 
// NOTE: You must REMOVE the import for your local Toast component if it existed: 
// import Toast from "../../components/Toast";
import "./AddProductForm.css"; // Assuming you have styles

const API_URL = import.meta.env?.VITE_API_URL || 'http://localhost:3001';

const AddProductForm = ({ editing, onClose, onCreated }) => {
  const { token } = useAuth();
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    stock: "",
    unit: "",
    location: "",
    categories: [] // This will store category IDs
  });

  const [availableCategories, setAvailableCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingCategories, setFetchingCategories] = useState(true);

  // Fetch available categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setFetchingCategories(true);
        const res = await axios.get(
          `${API_URL}/api/supplier-files/categories`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setAvailableCategories(res.data || []);
      } catch (err) {
        console.error("Error fetching categories:", err);
        // 💡 FIX 2: Call toast.error() directly
        toast.error("Failed to load categories");
      } finally {
        setFetchingCategories(false);
      }
    };

    if (token) {
      fetchCategories();
    }
  }, [token]);

  // Populate form when editing
  useEffect(() => {
    if (editing) {
      setFormData({
        name: editing.name || "",
        description: editing.description || "",
        price: editing.price || "",
        stock: editing.stock || "",
        unit: editing.unit || "",
        location: editing.location || "",
        // Use the categories array (which contains IDs) from the backend
        categories: editing.categories || []
      });
    }
  }, [editing]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCategoryChange = (categoryId) => {
    const id = parseInt(categoryId);
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(id)
        ? prev.categories.filter(c => c !== id)
        : [...prev.categories, id]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      // 💡 FIX 3: Call toast.error() directly
      toast.error("Product name is required");
      return;
    }
    if (!formData.unit.trim()) {
      // 💡 FIX 4: Call toast.error() directly
      toast.error("Unit is required");
      return;
    }
    if (formData.price && parseFloat(formData.price) < 0) {
      // 💡 FIX 5: Call toast.error() directly
      toast.error("Price cannot be negative");
      return;
    }
    if (formData.stock && parseFloat(formData.stock) < 0) {
      // 💡 FIX 6: Call toast.error() directly
      toast.error("Stock cannot be negative");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price) || 0,
        stock: parseFloat(formData.stock) || 0,
        unit: formData.unit.trim(),
        location: formData.location.trim() || null,
        categories: formData.categories // Send array of category IDs
      };

      if (editing) {
        // Update existing product
        await axios.put(
          `${API_URL}/api/supplier-files/items/${editing.id}`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        // 💡 FIX 7: Call toast.success() directly
        toast.success("Product updated successfully");
      } else {
        // Create new product
        await axios.post(
          `${API_URL}/api/supplier-files/items`,
          payload,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        // 💡 FIX 8: Call toast.success() directly
        toast.success("Product created successfully");
      }

      onCreated(); // Refresh the product list
      onClose(); // Close the modal
    } catch (err) {
      console.error("Error saving product:", err);
      const errorMsg = err.response?.data?.message || "Failed to save product";
      // 💡 FIX 9: Call toast.error() directly
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editing ? "Edit Product" : "Add New Product"}</h2>
          <button 
            className="close-btn" 
            onClick={onClose}
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="product-form">
          {/* Product Name */}
          <div className="form-group">
            <label htmlFor="name">
              Product Name <span className="required">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter product name"
              disabled={loading}
              required
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Enter product description"
              rows="3"
              disabled={loading}
            />
          </div>

          {/* Price and Stock Row */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="price">Price (₱)</label>
              <input
                type="number"
                id="price"
                name="price"
                value={formData.price}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="stock">Stock</label>
              <input
                type="number"
                id="stock"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                placeholder="0"
                min="0"
                disabled={loading}
              />
            </div>
          </div>

          {/* Unit and Location Row */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="unit">
                Unit <span className="required">*</span>
              </label>
              <input
                type="text"
                id="unit"
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                placeholder="e.g., kg, pcs, box"
                disabled={loading}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="location">Location</label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleChange}
                placeholder="Enter location"
                disabled={loading}
              />
            </div>
          </div>

          {/* Categories */}
          <div className="form-group">
            <label>Categories</label>
            {fetchingCategories ? (
              <p className="loading-text">Loading categories...</p>
            ) : availableCategories.length === 0 ? (
              <p className="no-categories">No categories available</p>
            ) : (
              <div className="categories-grid">
                {availableCategories.map((cat) => (
                  <label key={cat.CategoryID} className="category-checkbox">
                    <input
                      type="checkbox"
                      checked={formData.categories.includes(cat.CategoryID)}
                      onChange={() => handleCategoryChange(cat.CategoryID)}
                      disabled={loading}
                    />
                    <span>{cat.CategoryName}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="submit-btn"
              disabled={loading}
            >
              {loading ? "Saving..." : editing ? "Update Product" : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProductForm;