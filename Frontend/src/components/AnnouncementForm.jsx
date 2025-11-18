import React, { useState, useEffect, useRef } from "react";
import "./AnnouncementForm.css";
import axios from "axios";
import { useAuth } from "./AuthContext";

const AnnouncementForm = ({ onSubmit, onCancel }) => {
  const [form, setForm] = useState({
    description: "",
    categories: [],
    suppliers: [],
    sendType: "category", // "category" or "supplier"
    posted: "",
    end: "",
    file: null,
    title: "",
  });

  const { token } = useAuth();
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const supplierDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setDropdownOpen(false);
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) setSupplierDropdownOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setDropdownOpen(false);
        setSupplierDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (!token) return;
      try {
        // Fetch Categories
        const catResponse = await axios.get("http://localhost:3001/api/admin/categories", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const formattedCategories = catResponse.data.map(cat => ({ value: cat.CategoryID, label: cat.CategoryName }));
        setCategoryOptions([{ value: "all", label: "All Categories" }, ...formattedCategories]);

        // Fetch Suppliers
        const supResponse = await axios.get("http://localhost:3001/api/admin/suppliers", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const formattedSuppliers = supResponse.data.map((supplier) => ({
          value: supplier.SupplierID,
          label: supplier.CompanyName,
        }));
        setSupplierOptions([{ value: "all", label: "All Suppliers" }, ...formattedSuppliers]);
      } catch (error) {
        console.error("Failed to fetch initial form data:", error);
      }
    };
    fetchInitialData();
  }, [token]);
  const toggleDropdown = () => setDropdownOpen(!dropdownOpen);
  const toggleSupplierDropdown = () => setSupplierDropdownOpen(!supplierDropdownOpen);

  const handleCategoryChange = (cat, isChecked) => {
    if (cat.value === "all") {
      setForm({ ...form, categories: isChecked ? categoryOptions.map(c => c.value) : [] });
    } else {
      const filtered = form.categories.filter((c) => c !== "all");
      setForm({ ...form, categories: isChecked ? [...filtered, cat.value] : filtered.filter((c) => c !== cat.value) });
    }
  };

  const handleSupplierChange = (sup, isChecked) => {
    if (sup.value === "all") {
      setForm({ ...form, suppliers: isChecked ? supplierOptions.map(s => s.value) : [] });
    } else {
      const filtered = form.suppliers.filter((s) => s !== "all");
      setForm({ ...form, suppliers: isChecked ? [...filtered, sup.value] : filtered.filter((s) => s !== sup.value)});
    }
  };

  const handleRemoveCategory = (cat) => setForm({ ...form, categories: form.categories.filter((c) => c !== cat) });
  const handleRemoveSupplier = (sup) => setForm({ ...form, suppliers: form.suppliers.filter((s) => s !== sup) });

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSendTypeChange = (e) => setForm({ ...form, sendType: e.target.value, categories: [], suppliers: [] });

  const handleFileChange = (e) => setForm({ ...form, file: e.target.files[0] });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title || !form.posted || !form.end || !form.description) {
      alert("Please fill out all required fields.");
      return;
    }
    if (form.sendType === "category" && form.categories.length === 0) {
      alert("Please select at least one category.");
      return;
    }
    if (form.sendType === "supplier" && form.suppliers.length === 0) {
      alert("Please select at least one supplier.");
      return;
    }
    onSubmit(form);
  };

  return (
    <form className="announcement-form" onSubmit={handleSubmit}>
      <h3>📝Procurement Announcement</h3>

      <label>Title</label>
      <input type="text" name="title" value={form.title} onChange={handleChange} placeholder="Enter title" required />

      <label>Description</label>
      <textarea name="description" value={form.description} onChange={handleChange} placeholder="Enter description" rows="3" required />

      <label>Send Announcement To</label>
      <label>Category</label>
      <select name="categoryId" value={form.categoryId} onChange={handleChange} required>
        <option value="" disabled>Select a category</option>
        {/* We filter out the "All Categories" option here as it's not a real category */}
        {categoryOptions.filter(c => c.value !== 'all').map(cat => (
          <option key={cat.value} value={cat.value}>{cat.label}</option>
        ))}
      </select>

      <label>Send To</label>
      <div className="send-type-options">
        <label>
          <input type="radio" value="category" checked={form.sendType === "category"} onChange={handleSendTypeChange} />
          Category
        </label>
        <label>
          <input type="radio" value="supplier" checked={form.sendType === "supplier"} onChange={handleSendTypeChange} />
          Specific Supplier
        </label>
      </div>

      {/* Category Selection */}
      {/* This section is now replaced by the single-select dropdown above */}
      {/* {form.sendType === "category" && (
        <>
          <div className="dropdown-container" ref={dropdownRef}>
            <div className="dropdown-selected" onClick={toggleDropdown}>
              {form.categories.length > 0 ? `${form.categories.length} selected` : "Select Categories"}
              <span className="dropdown-arrow">{dropdownOpen ? "▲" : "▼"}</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                {categoryOptions.map((cat) => (
                  <label key={cat.value} className="dropdown-item">
                    <input type="checkbox" checked={form.categories.includes(cat.value)} onChange={(e) => handleCategoryChange(cat, e.target.checked)} />
                    <span className="category-label">{cat.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="selected-categories">
            {form.categories.filter(c => c !== 'all').map((catId) => (
              <span key={catId} className="category-badge">
                {categoryOptions.find(opt => opt.value === catId)?.label || 'Unknown'}
                <button type="button" className="remove-cat-btn" onClick={() => handleRemoveCategory(catId)}>×</button>
              </span>
            ))}
          </div>
        </>
      )} */}

      {/* Supplier Selection */}
      {form.sendType === "supplier" && (
        <>
          <div className="dropdown-container" ref={supplierDropdownRef}>
            <div className="dropdown-selected" onClick={toggleSupplierDropdown}>
              {form.suppliers.length > 0 ? `${form.suppliers.length} selected` : "Select Suppliers"}
              <span className="dropdown-arrow">{supplierDropdownOpen ? "▲" : "▼"}</span>
            </div>
            {supplierDropdownOpen && (
              <div className="dropdown-menu">
                {supplierOptions.map((sup) => (
                  <label key={sup.value} className="dropdown-item">
                    <input
                      type="checkbox"
                      checked={form.suppliers.includes(sup.value)}
                      onChange={(e) => handleSupplierChange(sup, e.target.checked)}
                    />
                    <span className="category-label">{sup.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="selected-categories">
            {form.suppliers.filter(s => s !== 'all').map((supId) => (
              <span key={supId} className="category-badge">
                {supplierOptions.find(opt => opt.value === supId)?.label || 'Unknown'}
                <button type="button" className="remove-cat-btn" onClick={() => handleRemoveSupplier(supId)}>×</button>
              </span>
            ))}
          </div>
        </>
      )}

      <div className="date-fields">
        <div>
          <label>Posted Date</label>
          <input type="date" name="posted" value={form.posted} onChange={handleChange} required />
        </div>
        <div>
          <label>End Date</label>
          <input type="date" name="end" value={form.end} onChange={handleChange} required />
        </div>
      </div>

      <label>Upload Procurement Document (PDF)</label>
      <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} required />

      <div className="form-actions">
        <button type="submit" className="save-btn">Post</button>
        <button type="button" className="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
};

export default AnnouncementForm;
