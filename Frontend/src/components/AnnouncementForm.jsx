import React, { useState, useEffect, useRef } from "react";
import "./AnnouncementForm.css";
import axios from "axios";
import { useAuth } from "./AuthContext";

const AnnouncementForm = ({ onSubmit, onCancel }) => {
  const { token } = useAuth();
  const dropdownRef = useRef(null);
  const supplierDropdownRef = useRef(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);

  const [categoryOptions, setCategoryOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);

  const [form, setForm] = useState({
    title: "",
    description: "",
    sendType: "category",
    categories: [],
    suppliers: [],
    posted: "",
    end: "",
    file: null
  });

  // ==========================
  // FETCH CATEGORIES & SUPPLIERS
  // ==========================
  useEffect(() => {
    fetchCategories();
    fetchSuppliers();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await axios.get("http://localhost:3001/api/admin/categories", {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("Raw categories from backend:", res.data);

      // Backend returns structure with "Subcategories"
      // We'll rename it to "children" for consistency
      const categoriesWithChildren = res.data.map(parent => ({
        CategoryID: parent.CategoryID,
        CategoryName: parent.CategoryName,
        ParentCategoryID: parent.ParentCategoryID,
        children: parent.Subcategories || []  // ✅ Rename from "Subcategories" to "children"
      }));

      console.log("Processed category tree:", categoriesWithChildren);

      setCategoryOptions(categoriesWithChildren);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await axios.get("http://localhost:3001/api/admin/suppliers", {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log("Raw suppliers from backend:", res.data);

      // Remove duplicates by SupplierID
      const uniqueSuppliersMap = {};
      res.data.forEach((s) => {
        if (!uniqueSuppliersMap[s.id]) {
          uniqueSuppliersMap[s.id] = {
            SupplierID: s.id,
            CompanyName: s.name,
          };
        }
      });

      const uniqueSuppliers = Object.values(uniqueSuppliersMap);

      console.log("Unique suppliers for dropdown:", uniqueSuppliers);

      setSupplierOptions(uniqueSuppliers);
    } catch (err) {
      console.error("Error fetching suppliers:", err);
    }
  };

  // =====================
  // HANDLE INPUT CHANGE
  // =====================
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setForm({ ...form, file: e.target.files[0] });
  };

  // ✅ NEW: Handle parent category selection - auto-select all children
  const handleParentCategoryChange = (parent, isChecked) => {
    let updated = [...form.categories];

    if (isChecked) {
      // Add parent
      if (!updated.includes(parent.CategoryID)) {
        updated.push(parent.CategoryID);
      }
      // Add all children
      parent.children.forEach((child) => {
        if (!updated.includes(child.CategoryID)) {
          updated.push(child.CategoryID);
        }
      });
    } else {
      // Remove parent
      updated = updated.filter((id) => id !== parent.CategoryID);
      // Remove all children
      parent.children.forEach((child) => {
        updated = updated.filter((id) => id !== child.CategoryID);
      });
    }

    setForm({ ...form, categories: updated });
  };

  // ✅ Handle individual child category selection
  const handleCategoryChange = (category, isChecked) => {
    let updated = [...form.categories];

    if (isChecked) {
      updated.push(category.CategoryID);
    } else {
      updated = updated.filter((id) => id !== category.CategoryID);
    }

    setForm({ ...form, categories: updated });
  };

  const handleSupplierChange = (supplier, isChecked) => {
    let updated = [...form.suppliers];

    if (isChecked) {
      updated.push(supplier.SupplierID);
    } else {
      updated = updated.filter((id) => id !== supplier.SupplierID);
    }

    setForm({ ...form, suppliers: updated });
  };

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target)) {
        setSupplierDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // =====================
  // SUBMIT FORM
  // =====================
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form className="announcement-form" onSubmit={handleSubmit}>
      <h3>📝 Procurement Announcement</h3>

      <label>Title</label>
      <input
        type="text"
        name="title"
        value={form.title}
        onChange={handleChange}
        placeholder="Enter title"
        required
      />

      <label>Description</label>
      <textarea
        name="description"
        value={form.description}
        onChange={handleChange}
        placeholder="Enter description"
        rows="3"
        required
      />

      <label>Send To</label>
      <div className="send-type-options">
        <label>
          <input
            type="radio"
            name="sendType"
            value="category"
            checked={form.sendType === "category"}
            onChange={handleChange}
          />
          Category
        </label>

        <label>
          <input
            type="radio"
            name="sendType"
            value="supplier"
            checked={form.sendType === "supplier"}
            onChange={handleChange}
          />
          Supplier
        </label>
      </div>

      {/* ✅ FIXED CATEGORY DROPDOWN */}
      {form.sendType === "category" && (
        <div ref={dropdownRef} className="dropdown-container">
          <div className="dropdown-selected" onClick={() => setDropdownOpen(!dropdownOpen)}>
            {form.categories.length > 0
              ? `${form.categories.length} categories selected`
              : "Select Categories"}
            <span className="dropdown-arrow">{dropdownOpen ? "▲" : "▼"}</span>
          </div>

          {dropdownOpen && (
            <div className="dropdown-menu-CR">
              {categoryOptions.map((parent) => (
                <div key={`parent-${parent.CategoryID}`}>
                  {/* ✅ Parent Category - Selects all children when checked */}
                  <label className="dropdown-item parent-item">
                    <input
                      type="checkbox"
                      checked={form.categories.includes(parent.CategoryID)}
                      onChange={(e) => handleParentCategoryChange(parent, e.target.checked)}
                    />
                    <strong>📁 {parent.CategoryName}</strong>
                  </label>

                  {/* ✅ Child Categories - Individual selection */}
                  {parent.children && parent.children.length > 0 && (
                    <div className="children-container">
                      {parent.children.map((child) => (
                        <label key={`child-${child.CategoryID}`} className="dropdown-item child-category">
                          <input
                            type="checkbox"
                            checked={form.categories.includes(child.CategoryID)}
                            onChange={(e) => handleCategoryChange(child, e.target.checked)}
                          />
                          └─ {child.CategoryName}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUPPLIER DROPDOWN - UNCHANGED */}
      {form.sendType === "supplier" && (
        <div ref={supplierDropdownRef} className="dropdown-container">
          <div
            className="dropdown-selected"
            onClick={() => setSupplierDropdownOpen(!supplierDropdownOpen)}
          >
            {form.suppliers.length > 0
              ? `${form.suppliers.length} suppliers selected`
              : "Select Suppliers"}
            <span className="dropdown-arrow">{supplierDropdownOpen ? "▲" : "▼"}</span>
          </div>

          {supplierDropdownOpen && (
            <div className="dropdown-menu">
              {supplierOptions.map((sup) => {
                return (
                  <label key={`supplier-${sup.SupplierID}`} className="dropdown-item">
                    <input
                      type="checkbox"
                      checked={form.suppliers.includes(sup.SupplierID)}
                      onChange={(e) => handleSupplierChange(sup, e.target.checked)}
                    />
                    {sup.CompanyName}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="date-fields">
        <div>
          <label>Posted Date</label>
          <input
            type="date"
            name="posted"
            value={form.posted}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>End Date</label>
          <input
            type="date"
            name="end"
            value={form.end}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <label>Upload Procurement Document (PDF)</label>
      <input type="file" accept="application/pdf" onChange={handleFileChange} />

      <div className="form-actions">
        <button type="submit" className="save-btn">Post</button>
        <button type="button" className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export default AnnouncementForm;