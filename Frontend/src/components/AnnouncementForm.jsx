import React, { useState, useEffect, useRef } from "react";
import "./AnnouncementForm.css";

const AnnouncementForm = ({ onSubmit, onCancel, supplierOptions = [] }) => {
  const [form, setForm] = useState({
    title: "",
    description: "",
    categories: [],
    suppliers: [],
    sendType: "category", // "category" or "supplier"
    posted: "",
    end: "",
    file: null,
  });

  const categoryOptions = [
    "All",
    "ICT Equipment",
    "Office Supplies",
    "Furniture",
    "Printing Services",
    "Stationery",
    "Electronics",
    "Cleaning Supplies",
  ];

  // Sample suppliers placeholder
  const supplierOptionsDefault = [
    "All",
    "ABC Trading",
    "SM Supplies",
    "XYZ Traders",
    "Global Tech",
    "Sample Supplier 1",
    "Sample Supplier 2",
  ];

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

  const toggleDropdown = () => setDropdownOpen(!dropdownOpen);
  const toggleSupplierDropdown = () => setSupplierDropdownOpen(!supplierDropdownOpen);

  const handleCategoryChange = (cat, isChecked) => {
    if (cat === "All") {
      setForm({ ...form, categories: isChecked ? ["All"] : [] });
    } else {
      const filtered = form.categories.filter((c) => c !== "All");
      setForm({ ...form, categories: isChecked ? [...filtered, cat] : filtered.filter((c) => c !== cat) });
    }
  };

  const handleSupplierChange = (sup, isChecked) => {
    if (sup === "All") {
      setForm({ ...form, suppliers: isChecked ? ["All"] : [] });
    } else {
      const filtered = form.suppliers.filter((s) => s !== "All");
      setForm({ ...form, suppliers: isChecked ? [...filtered, sup] : filtered.filter((s) => s !== sup) });
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

  // Use default suppliers if none passed
  const supplierList = supplierOptions.length > 0 ? supplierOptions : supplierOptionsDefault;

  return (
    <form className="announcement-form" onSubmit={handleSubmit}>
      <h3>📝Procurement Announcement</h3>

      <label>Title</label>
      <input type="text" name="title" value={form.title} onChange={handleChange} placeholder="Enter title" required />

      <label>Description</label>
      <textarea name="description" value={form.description} onChange={handleChange} placeholder="Enter description" rows="3" required />

      <label>Send Announcement To</label>
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
      {form.sendType === "category" && (
        <>
          <div className="dropdown-container" ref={dropdownRef}>
            <div className="dropdown-selected" onClick={toggleDropdown}>
              {form.categories.length > 0 ? `${form.categories.length} selected` : "Select Categories"}
              <span className="dropdown-arrow">{dropdownOpen ? "▲" : "▼"}</span>
            </div>
            {dropdownOpen && (
              <div className="dropdown-menu">
                {categoryOptions.map((cat) => (
                  <label key={cat} className="dropdown-item">
                    <input type="checkbox" checked={form.categories.includes(cat)} onChange={(e) => handleCategoryChange(cat, e.target.checked)} />
                    <span className="category-label">{cat}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="selected-categories">
            {form.categories.map((cat) => (
              <span key={cat} className="category-badge">
                {cat}
                {cat !== "All" && <button type="button" className="remove-cat-btn" onClick={() => handleRemoveCategory(cat)}>×</button>}
              </span>
            ))}
          </div>
        </>
      )}

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
                {supplierList.map((sup) => (
                  <label key={sup} className="dropdown-item">
                    <input
                      type="checkbox"
                      checked={form.suppliers.includes(sup)}
                      onChange={(e) => handleSupplierChange(sup, e.target.checked)}
                    />
                    <span className="category-label">{sup}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="selected-categories">
            {form.suppliers.map((sup) => (
              <span key={sup} className="category-badge">
                {sup}
                {sup !== "All" && <button type="button" className="remove-cat-btn" onClick={() => handleRemoveSupplier(sup)}>×</button>}
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

      <label>Upload Quotation File (Excel/CSV)</label>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />

      <div className="form-actions">
        <button type="submit" className="save-btn">Post</button>
        <button type="button" className="cancel-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
};

export default AnnouncementForm;
