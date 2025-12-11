import React, { useState, useEffect, useRef, useMemo } from "react";
import "./AnnouncementForm.css";
import api from "../api";
import { useAuth } from "./AuthContext";
import Toast from "./Toast";

const AnnouncementForm = ({ onSubmit, onCancel, initialValues = null, mode = "create" }) => {
  const { token } = useAuth();
  const dropdownRef = useRef(null);
  const supplierDropdownRef = useRef(null);
  const isEditMode = mode === "edit";

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });

  const defaultFormState = useMemo(
    () => ({
      title: "",
      description: "",
      sendType: "category",
      categories: [],
      suppliers: [],
      end: "",
      file: null,
      fileName: "",
      filePath: "",
      notes: "",
    }),
    []
  );

  const [form, setForm] = useState(() => ({ ...defaultFormState }));

  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const currentFileUrl = useMemo(() => {
    if (!form.filePath) {
      return "";
    }
    if (/^https?:\/\//i.test(form.filePath)) {
      return form.filePath;
    }
    const normalized = form.filePath.startsWith("/") ? form.filePath : `/${form.filePath}`;
    const base = import.meta.env.VITE_API_URL || "http://localhost:3001";
    return `${base}${normalized}`;
  }, [form.filePath]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const fetchOptions = async () => {
      try {
        const [categoriesRes, suppliersRes] = await Promise.all([
          api.get("/api/admin/categories", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          api.get("/api/admin/suppliers", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const categoriesWithChildren = (categoriesRes.data || []).map((parent) => ({
          CategoryID: parent.CategoryID,
          CategoryName: parent.CategoryName,
          ParentCategoryID: parent.ParentCategoryID,
          children: parent.Subcategories || [],
        }));

        const supplierMap = {};
        (suppliersRes.data || []).forEach((item) => {
          const id = item.id ?? item.SupplierID ?? item.supplier_id;
          const name = item.name ?? item.CompanyName ?? item.company_name;
          if (id && !supplierMap[id]) {
            supplierMap[id] = { SupplierID: id, CompanyName: name || `Supplier ${id}` };
          }
        });

        setCategoryOptions(categoriesWithChildren);
        setSupplierOptions(Object.values(supplierMap));
      } catch (err) {
        console.error("Failed to load dropdown data", err);
        setToast({ visible: true, type: "error", message: "Unable to load categories or suppliers." });
      }
    };

    fetchOptions();
  }, [token]);

  useEffect(() => {
    if (isEditMode && initialValues) {
      setForm({
        title: initialValues.title || "",
        description: initialValues.description || "",
        sendType: initialValues.sendType === "supplier" ? "supplier" : "category",
        categories: Array.isArray(initialValues.categories) ? initialValues.categories : [],
        suppliers: Array.isArray(initialValues.suppliers) ? initialValues.suppliers : [],
        end: initialValues.end || "",
        file: null,
        fileName: initialValues.fileName || "",
        filePath: initialValues.filePath || "",
        notes: "",
      });
    } else if (!isEditMode) {
      setForm({ ...defaultFormState });
    }
  }, [isEditMode, initialValues, defaultFormState]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    if (isEditMode && !["end", "notes"].includes(name)) {
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;
    if (!nextFile) {
      setForm((prev) => ({ ...prev, file: null, fileName: prev.fileName }));
      return;
    }
    setForm((prev) => ({ ...prev, file: nextFile, fileName: nextFile.name }));
  };

  const handleParentCategoryChange = (parent, isChecked) => {
    if (isEditMode) {
      return;
    }
    setForm((prev) => {
      let next = [...prev.categories];
      if (isChecked) {
        if (!next.includes(parent.CategoryID)) {
          next.push(parent.CategoryID);
        }
        (parent.children || []).forEach((child) => {
          if (!next.includes(child.CategoryID)) {
            next.push(child.CategoryID);
          }
        });
      } else {
        next = next.filter((id) => id !== parent.CategoryID);
        (parent.children || []).forEach((child) => {
          next = next.filter((id) => id !== child.CategoryID);
        });
      }
      return { ...prev, categories: next };
    });
  };

  const handleCategoryChange = (category, isChecked) => {
    if (isEditMode) {
      return;
    }
    setForm((prev) => {
      let next = [...prev.categories];
      if (isChecked) {
        next.push(category.CategoryID);
      } else {
        next = next.filter((id) => id !== category.CategoryID);
      }
      return { ...prev, categories: next };
    });
  };

  const handleSupplierChange = (supplier, isChecked) => {
    if (isEditMode) {
      return;
    }
    setForm((prev) => {
      let next = [...prev.suppliers];
      if (isChecked) {
        next.push(supplier.SupplierID);
      } else {
        next = next.filter((id) => id !== supplier.SupplierID);
      }
      return { ...prev, suppliers: next };
    });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target)) {
        setSupplierDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const validateForm = () => {
    if (!form.title.trim()) {
      setToast({ visible: true, type: "warning", message: "Please enter a title." });
      return false;
    }
    if (!form.description.trim()) {
      setToast({ visible: true, type: "warning", message: "Please enter a description." });
      return false;
    }
    if (!form.end) {
      setToast({ visible: true, type: "warning", message: "Please select an end date." });
      return false;
    }
    const endDate = new Date(form.end);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (endDate < today) {
      setToast({ visible: true, type: "error", message: "End date cannot be in the past." });
      return false;
    }
    if (form.sendType === "category" && form.categories.length === 0) {
      setToast({ visible: true, type: "warning", message: "Select at least one category." });
      return false;
    }
    if (form.sendType === "supplier" && form.suppliers.length === 0) {
      setToast({ visible: true, type: "warning", message: "Select at least one supplier." });
      return false;
    }
    if (!isEditMode && !form.file) {
      setToast({ visible: true, type: "warning", message: "Please upload a procurement document." });
      return false;
    }
    if (isEditMode && !form.notes.trim()) {
      setToast({ visible: true, type: "warning", message: "Please include notes explaining this repost." });
      return false;
    }
    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) {
      return;
    }
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        categories: [...form.categories],
        suppliers: [...form.suppliers],
        notes: form.notes.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitLabel = isEditMode ? "Update" : "Post";

  return (
    <form className="announcement-form" onSubmit={handleSubmit}>
      <Toast
        type={toast.type}
        message={toast.message}
        visible={toast.visible}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
        duration={3000}
      />

      <label>Title</label>
      <input
        type="text"
        name="title"
        value={form.title}
        onChange={handleChange}
        placeholder="Enter announcement title"
        required
        disabled={isEditMode}
      />

      <label>Description</label>
      <textarea
        name="description"
        value={form.description}
        onChange={handleChange}
        placeholder="Enter description"
        rows="3"
        required
        disabled={isEditMode}
      />

      {isEditMode && (
        <div
          className="alert"
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            padding: "12px",
            borderRadius: "6px",
            fontSize: "13px",
            marginTop: "12px",
          }}
        >
          When reposting you can adjust the end date and add notes for your audit trail. All other fields remain unchanged.
        </div>
      )}

        {isEditMode && (
          <div style={{ marginTop: "18px" }}>
            <label htmlFor="announcement-notes">
              Repost Notes <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              id="announcement-notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Explain what changed or why this announcement is being reposted"
              rows={4}
              required
              disabled={submitting}
            />
            <p style={{ fontSize: "12px", color: "#6b7280", marginTop: "-6px", marginBottom: "15px" }}>
              Notes are recorded in the status history to inform suppliers and stakeholders.
            </p>
          </div>
        )}

      {!isEditMode && (
        <>
          <label style={{ marginTop: "20px" }}>Send To</label>
          <p style={{ fontSize: "12px", color: "#666", marginTop: "-5px", marginBottom: "10px" }}>
            Choose how to distribute this announcement
          </p>
          <div className="send-type-options">
            <label>
              <input
                type="radio"
                name="sendType"
                value="category"
                checked={form.sendType === "category"}
                onChange={handleChange}
              />
              Send to all suppliers in selected categories
            </label>

            <label>
              <input
                type="radio"
                name="sendType"
                value="supplier"
                checked={form.sendType === "supplier"}
                onChange={handleChange}
              />
              Send to specific suppliers
            </label>
          </div>
        </>
      )}

      {form.sendType === "category" && !isEditMode && (
        <>
          <label>Categories <span style={{ color: "red" }}>*</span></label>
          <p style={{ fontSize: "12px", color: "#666", marginTop: "-5px", marginBottom: "10px" }}>
            Select categories to send this announcement to
          </p>
          <div ref={dropdownRef} className="dropdown-container">
            <div className="dropdown-selected" onClick={() => setDropdownOpen((open) => !open)}>
              {form.categories.length > 0
                ? `${form.categories.length} categories selected`
                : "Select Categories"}
              <span className="dropdown-arrow">{dropdownOpen ? "▲" : "▼"}</span>
            </div>

            {dropdownOpen && (
              <div className="dropdown-menu-CR">
                {categoryOptions.map((parent) => (
                  <div key={`parent-${parent.CategoryID}`}>
                    <label className="dropdown-item parent-item">
                      <input
                        type="checkbox"
                        checked={form.categories.includes(parent.CategoryID)}
                        onChange={(event) => handleParentCategoryChange(parent, event.target.checked)}
                      />
                      <strong>📁 {parent.CategoryName}</strong>
                    </label>

                    {Array.isArray(parent.children) && parent.children.length > 0 && (
                      <div className="children-container">
                        {parent.children.map((child) => (
                          <label key={`child-${child.CategoryID}`} className="dropdown-item child-category">
                            <input
                              type="checkbox"
                              checked={form.categories.includes(child.CategoryID)}
                              onChange={(event) => handleCategoryChange(child, event.target.checked)}
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
        </>
      )}

      {form.sendType === "supplier" && !isEditMode && (
        <div ref={supplierDropdownRef} className="dropdown-container">
          <div className="dropdown-selected" onClick={() => setSupplierDropdownOpen((open) => !open)}>
            {form.suppliers.length > 0
              ? `${form.suppliers.length} suppliers selected`
              : "Select Suppliers"}
            <span className="dropdown-arrow">{supplierDropdownOpen ? "▲" : "▼"}</span>
          </div>

          {supplierDropdownOpen && (
            <div className="dropdown-menu">
              {supplierOptions.map((supplier) => (
                <label key={`supplier-${supplier.SupplierID}`} className="dropdown-item">
                  <input
                    type="checkbox"
                    checked={form.suppliers.includes(supplier.SupplierID)}
                    onChange={(event) => handleSupplierChange(supplier, event.target.checked)}
                  />
                  {supplier.CompanyName}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {isEditMode && form.sendType === "category" && form.categories.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <label>Target Categories</label>
          <p style={{ fontSize: "12px", color: "#666", margin: "6px 0" }}>
            These categories remain assigned for the reposted announcement.
          </p>
          <ul style={{ listStyle: "disc", marginLeft: "18px", color: "#1f2937", fontSize: "13px" }}>
            {form.categories.map((categoryId) => {
              const flattened = categoryOptions.flatMap((parent) => [parent, ...(parent.children || [])]);
              const match = flattened.find((item) => item.CategoryID === categoryId);
              return <li key={`selected-cat-${categoryId}`}>{match ? match.CategoryName : `Category ${categoryId}`}</li>;
            })}
          </ul>
        </div>
      )}

      {isEditMode && form.sendType === "supplier" && form.suppliers.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <label>Target Suppliers</label>
          <p style={{ fontSize: "12px", color: "#666", margin: "6px 0" }}>
            These suppliers remain assigned for the reposted announcement.
          </p>
          <ul style={{ listStyle: "disc", marginLeft: "18px", color: "#1f2937", fontSize: "13px" }}>
            {form.suppliers.map((supplierId) => {
              const match = supplierOptions.find((item) => item.SupplierID === supplierId);
              return <li key={`selected-supplier-${supplierId}`}>{match ? match.CompanyName : `Supplier ${supplierId}`}</li>;
            })}
          </ul>
        </div>
      )}

      <div className="date-fields">
        <div>
          <label>End Date</label>
          <input
            type="date"
            name="end"
            value={form.end}
            onChange={handleChange}
            min={todayStr}
            required
          />
        </div>
      </div>

      <label>{isEditMode ? "Current Procurement Document" : "Upload Procurement Document (PDF)"}</label>
      {isEditMode && form.fileName && (
        <p style={{ fontSize: "12px", color: "#555", marginBottom: "6px" }}>
          Current file: {form.fileName}
          {currentFileUrl && (
            <span>
              {" "}
              <a href={currentFileUrl} target="_blank" rel="noopener noreferrer">
                (View)
              </a>
            </span>
          )}
        </p>
      )}
      {!isEditMode && <input type="file" accept="application/pdf" onChange={handleFileChange} />}

      <div className="form-actions">
        <button type="submit" className="save-btn" disabled={submitting}>
          {submitting ? "Saving..." : submitLabel}
        </button>
        <button type="button" className="cancel-btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export default AnnouncementForm;
