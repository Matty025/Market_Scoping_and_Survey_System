import React, { useEffect, useState, useRef } from 'react';
import axios from "axios";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import "./AddProductForm.css";

const backendBase = "http://localhost:3001";
const units = [
  "pc",
  "kg",
  "g",
  "pack",
  "box",
  "case",
  "unit",
  "L",
  "mL",
  "m",
  "cm",
];

export default function AddProductForm({ onClose, onCreated, productToEdit }) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState(units[0]); // Use the predefined list
  const [location, setLocation] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [matches, setMatches] = useState([]);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "info" });
  const [isEditMode, setIsEditMode] = useState(false);
  const categoryRef = useRef(null);

  useEffect(() => {
    fetchCategories();

    if (productToEdit) {
      setIsEditMode(true);
      setName(productToEdit.name || '');
      setDescription(productToEdit.description || '');
      setPrice(productToEdit.price || '');
      setStock(productToEdit.stock || '');
      setUnit(productToEdit.unit || units[0]);
      setLocation(productToEdit.location || '');
      // Note: Fetching and setting categories for the item to edit is a more complex step.
      // We will handle this in a future enhancement to keep this step clear.
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, productToEdit]);

  const fetchCategories = async () => {
    if (!token) return;
    try {
      // CORRECTED: Use the endpoint you provided
      const categoriesRes = await axios.get(`${backendBase}/api/supplier-files/categories`, { headers: { Authorization: `Bearer ${token}` } });
      if (Array.isArray(categoriesRes.data) && categoriesRes.data.length > 0) {
        const flat = categoriesRes.data.map((c) => ({ id: c.CategoryID, name: c.CategoryName }));
        setAllCategories(flat);
      } else {
        setAllCategories([]);
        setToast({ visible: true, message: 'No categories assigned to your supplier profile.', type: 'info' });
      }
    } catch (err) {
      console.error('Failed to fetch categories', err);
      setToast({ visible: true, message: `Failed to load categories: ${err.message}`, type: 'error' });
    }
  };

  const toggleCategory = (id) => {
    setSelectedCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const filteredCategories = allCategories.filter((c) => c.name.toLowerCase().includes(categoryFilter.toLowerCase()));

  useEffect(() => {
    const onDocClick = (e) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target)) {
        setCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return setToast({ visible: true, message: 'Not authenticated', type: 'error' });
    if (!name || !unit) return setToast({ visible: true, message: 'Name and unit required', type: 'error' });

    try {
      const payload = { name, description, price: parseFloat(price) || 0, stock: parseFloat(stock) || 0, unit, location, categories: selectedCategories };

      if (isEditMode) {
        // --- UPDATE LOGIC ---
        await axios.put(`${backendBase}/api/supplier-files/items/${productToEdit.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setToast({ visible: true, message: 'Item updated successfully!', type: 'success' });
      } else {
        // --- CREATE LOGIC ---
        const res = await axios.post(`${backendBase}/api/supplier-files/items`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setToast({ visible: true, message: 'Item created successfully!', type: 'success' });
      }

      onCreated && onCreated(); // Notify parent to refetch data
      onClose && onClose();
    } catch (err) {
      console.error('Form submission failed', err);
      setToast({ visible: true, message: `Action failed: ${err.response?.data?.message || err.message}`, type: 'error' });
    }
  };

return (
  <div className="modal-overlay">
    <div className="modal-content enhanced-modal">

      {/* HEADER */}
      <div className="modal-header">
        <h3>{isEditMode ? 'Edit Product' : 'Add New Product'}</h3>
        <button aria-label="Close" className="close-button" onClick={onClose}>
          &times;
        </button>
      </div>

      {/* FORM */}
      <form onSubmit={handleSubmit} className="add-product-form">

        {/* NAME */}
        <div className="form-group">
          <label htmlFor="ap-name">
            Name * <span className="info">ⓘ</span>
          </label>
          <input
            id="ap-name"
            placeholder="e.g. Cement Type 1 (40kg)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <small className="helper-text">
            Enter the exact product name as shown on packaging.
          </small>
        </div>

       {/* DESCRIPTION */}
<div className="form-group">
  <label htmlFor="ap-description">
    Description <span className="info">ⓘ</span>
  </label>

  <textarea
    id="ap-description"
    placeholder="Enter product details like brand, model, material, color, etc."
    value={description}
    onChange={(e) => setDescription(e.target.value)}
  />

  <small className="helper-text">
    Provide any additional details about the product.
  </small>
</div>


        {/* LOCATION (NEW - from Items Table) */}
        <div className="form-group">
          <label htmlFor="ap-location">
            Location * <span className="info">ⓘ</span>
          </label>

          <input
            id="ap-location"
            placeholder="e.g. Malolos"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
          />

          <small className="helper-text">
            Where this item is available or where it ships from.
          </small>
        </div>

        {/* PRICE - STOCK - UNIT */}
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="ap-price">Price *</label>
            <input
              id="ap-price"
              type="number"
              step="0.01"
              placeholder="e.g. 250.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
            <small className="helper-text">Unit price of the product.</small>
          </div>

          <div className="form-group">
            <label htmlFor="ap-stock">Stock *</label>
            <input
              id="ap-stock"
              type="number"
              step="1"
              placeholder="e.g. 100"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              required
            />
            <small className="helper-text">How many items are available.</small>
          </div>

          <div className="form-group">
            <label htmlFor="ap-unit">Unit *</label>
            <select
              id="ap-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            <small className="helper-text">
              Example: bag, kg, piece, box, set, pack.
            </small>
          </div>
        </div>

        {/* CATEGORIES */}
        <div className="form-group">
          <label>
            Categories (choose any) <span className="info">ⓘ</span>
          </label>

          <div className="multi-select enhanced" ref={categoryRef}>
            <button
              type="button"
              className="ms-control"
              onClick={() => setCategoryOpen((s) => !s)}
              aria-haspopup="listbox"
              aria-expanded={categoryOpen}
            >
              <div className="ms-chips">
                {selectedCategories.length === 0 && (
                  <span className="ms-placeholder">Select categories...</span>
                )}

                {selectedCategories.map((id) => {
                  const item = allCategories.find((c) => c.id === id);
                  return (
                    <span key={id} className="ms-chip">
                      {item ? item.name : id}
                      <button
                        type="button"
                        className="ms-chip-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCategory(id);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
              <span className="ms-caret">▾</span>
            </button>

            {categoryOpen && (
              <div className="ms-dropdown" role="listbox">
                <div className="ms-search">
                  <input
                    placeholder="Search categories..."
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  />
                </div>

                <div className="ms-list">
                  {filteredCategories.length === 0 ? (
                    <div className="ms-empty">No categories found</div>
                  ) : (
                    filteredCategories.map((c) => (
                      <label key={c.id} className="ms-item">
                        <input
                          type="checkbox"
                          checked={selectedCategories.includes(c.id)}
                          onChange={() => toggleCategory(c.id)}
                        />
                        <span className="ms-item-name">{c.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <small className="helper-text">
            Select all categories this product belongs to.
          </small>
        </div>

        {/* ACTIONS */}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {isEditMode ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </form>

      {/* TOAST */}
      <Toast
        visible={toast.visible}
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, visible: false })}
      />
    </div>
  </div>
);


}
