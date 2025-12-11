import React, { useState, useEffect, useMemo, useCallback } from "react";
import api from "../../api";
import { FaSitemap, FaPlusCircle, FaSave, FaSyncAlt } from "react-icons/fa";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import AdminCategoryModal from "../../components/AdminCategoryModal";
import AdminSubcategoryModal from "../../components/AdminSubcategoryModal";
import "./Settings.css";

const findCategoryNode = (nodes, targetId) => {
  for (const node of nodes) {
    if (node.CategoryID === targetId) {
      return node;
    }
    const children = Array.isArray(node.Subcategories) ? node.Subcategories : [];
    const match = findCategoryNode(children, targetId);
    if (match) {
      return match;
    }
  }
  return null;
};

const collectDescendantIds = (node, acc = new Set()) => {
  if (!node) {
    return acc;
  }
  const children = Array.isArray(node.Subcategories) ? node.Subcategories : [];
  children.forEach((child) => {
    acc.add(child.CategoryID);
    collectDescendantIds(child, acc);
  });
  return acc;
};

const flattenCategoryTree = (nodes, depth = 0, path = []) => {
  const items = [];
  nodes.forEach((node) => {
    const nextPath = [...path, node.CategoryName];
    const children = Array.isArray(node.Subcategories) ? node.Subcategories : [];
    const nodeItemCount = Number(node.ItemCount ?? 0);
    items.push({
      id: node.CategoryID,
      name: node.CategoryName,
      parentId: node.ParentCategoryID ?? null,
      depth,
      path: nextPath,
      childCount: children.length,
      itemCount: nodeItemCount,
    });
    items.push(...flattenCategoryTree(children, depth + 1, nextPath));
  });
  return items;
};

const formatCount = (value) => {
  const numeric = Number(value ?? 0);
  return Number.isNaN(numeric) ? "0" : new Intl.NumberFormat("en-US").format(numeric);
};

const Settings = () => {
  const { token } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });

  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editParent, setEditParent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [createName, setCreateName] = useState("");
  const [createParent, setCreateParent] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [activeSection, setActiveSection] = useState("categories");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [subcategoryManagerParentId, setSubcategoryManagerParentId] = useState(null);

  const fetchCategories = useCallback(async () => {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/categories", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      console.error("Failed to load categories:", err);
      const message = err.response?.data?.message || "Failed to load categories.";
      setError(message);
      setToast({ visible: true, type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const flattenedCategories = useMemo(() => flattenCategoryTree(categories), [categories]);

  const topLevelSummaries = useMemo(() => {
    return categories.map((category) => {
      const immediateChildren = Array.isArray(category.Subcategories) ? category.Subcategories : [];
      const allDescendants = flattenCategoryTree(immediateChildren);
      const directItemCount = Number(category.ItemCount ?? 0);
      const descendantItemCount = allDescendants.reduce((sum, entry) => sum + (entry.itemCount ?? 0), 0);
      return {
        node: category,
        immediateChildren,
        immediateChildCount: immediateChildren.length,
        totalDescendants: allDescendants.length,
        directItemCount,
        totalItemCount: directItemCount + descendantItemCount,
      };
    });
  }, [categories]);

  const parentOptions = useMemo(
    () =>
      categories.map((category) => ({
        id: category.CategoryID,
        name: category.CategoryName,
        path: [category.CategoryName],
      })),
    [categories]
  );

  const selectedCategory = useMemo(
    () => flattenedCategories.find((cat) => cat.id === selectedCategoryId) || null,
    [flattenedCategories, selectedCategoryId]
  );

  useEffect(() => {
    if (selectedCategory) {
      setEditName(selectedCategory.name);
      setEditParent(selectedCategory.parentId ? String(selectedCategory.parentId) : "");
    } else {
      setEditName("");
      setEditParent("");
    }
  }, [selectedCategory]);

  const activeSubcategoryParent = useMemo(
    () => (subcategoryManagerParentId ? findCategoryNode(categories, subcategoryManagerParentId) : null),
    [categories, subcategoryManagerParentId]
  );

  const activeSubcategoryItems = useMemo(() => {
    if (!activeSubcategoryParent) {
      return [];
    }
    const directChildren = Array.isArray(activeSubcategoryParent.Subcategories)
      ? activeSubcategoryParent.Subcategories
      : [];
    return directChildren.map((child) => {
      const childSubcategories = Array.isArray(child.Subcategories) ? child.Subcategories : [];
      const nestedDescendants = flattenCategoryTree(childSubcategories);
      const directItemCount = Number(child.ItemCount ?? 0);
      const descendantItemCount = nestedDescendants.reduce((sum, entry) => sum + (entry.itemCount ?? 0), 0);
      return {
        node: child,
        directChildCount: childSubcategories.length,
        totalDescendants: nestedDescendants.length,
        directItemCount,
        totalItemCount: directItemCount + descendantItemCount,
      };
    });
  }, [activeSubcategoryParent]);

  useEffect(() => {
    if (!selectedCategoryId) {
      return;
    }
    const stillExists = flattenedCategories.some((cat) => cat.id === selectedCategoryId);
    if (!stillExists) {
      setSelectedCategoryId(null);
    }
  }, [flattenedCategories, selectedCategoryId]);

  const toggleSection = (sectionKey) => {
    setActiveSection((prev) => (prev === sectionKey ? null : sectionKey));
  };

  const handleSelectCategory = (categoryId) => {
    setSelectedCategoryId(categoryId);
  };

  const handleOpenAddModal = (parentId = "") => {
    setCreateName("");
    setCreateParent(parentId ? String(parentId) : "");
    setShowAddModal(true);
  };

  const handleOpenEditModal = (categoryId) => {
    const target = flattenedCategories.find((cat) => cat.id === categoryId);
    if (!target) {
      return;
    }
    setSelectedCategoryId(categoryId);
    setEditName(target.name);
    setEditParent(target.parentId ? String(target.parentId) : "");
    setShowEditModal(true);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
  };

  const handleOpenSubcategoryManager = (parentId) => {
    setSubcategoryManagerParentId(parentId);
    setShowSubcategoryModal(true);
  };

  const handleCloseSubcategoryManager = () => {
    setShowSubcategoryModal(false);
    setSubcategoryManagerParentId(null);
  };

  const disallowedParentIds = useMemo(() => {
    if (!showEditModal || !selectedCategoryId) {
      return new Set();
    }
    const node = findCategoryNode(categories, selectedCategoryId);
    const blocked = new Set([selectedCategoryId]);
    collectDescendantIds(node, blocked);
    return blocked;
  }, [categories, selectedCategoryId, showEditModal]);


  const normaliseParentValue = (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    const trimmed = createName.trim();
    if (!trimmed) {
      setToast({ visible: true, type: "warning", message: "Category name cannot be empty." });
      return;
    }

    const parentPayload = normaliseParentValue(createParent);

    setIsCreating(true);
    try {
      await api.post(
        "/api/admin/categories",
        { name: trimmed, parentCategoryId: parentPayload },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setToast({ visible: true, type: "success", message: "Category added." });
      setCreateName("");
      setCreateParent("");
      setShowAddModal(false);
      await fetchCategories();
    } catch (err) {
      console.error("Failed to create category:", err);
      const message = err.response?.data?.message || "Unable to create category.";
      setToast({ visible: true, type: "error", message });
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateCategory = async (event) => {
    event.preventDefault();
    if (!token || !selectedCategoryId) {
      return;
    }
    const trimmed = editName.trim();
    if (!trimmed) {
      setToast({ visible: true, type: "warning", message: "Category name cannot be empty." });
      return;
    }

    const parentPayload = normaliseParentValue(editParent);

    setIsSaving(true);
    try {
      await api.put(
        `/api/admin/categories/${selectedCategoryId}`,
        { name: trimmed, parentCategoryId: parentPayload },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setToast({ visible: true, type: "success", message: "Category updated." });
      await fetchCategories();
      setShowEditModal(false);
    } catch (err) {
      console.error("Failed to update category:", err);
      const message = err.response?.data?.message || "Unable to update category.";
      setToast({ visible: true, type: "error", message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = () => {
    fetchCategories();
  };

  const totalCategories = flattenedCategories.length;
  const topLevelCategoryCount = categories.length;
  const subcategoryCount = flattenedCategories.reduce(
    (count, category) => (category.depth > 0 ? count + 1 : count),
    0
  );
  const populatedCategoryCount = flattenedCategories.reduce(
    (count, category) => (Number(category.itemCount || 0) > 0 ? count + 1 : count),
    0
  );

  return (
    <div className="settings-page">
      <Toast
        type={toast.type}
        message={toast.message}
        visible={toast.visible}
        onClose={() => setToast((prev) => ({ ...prev, visible: false }))}
        duration={3200}
      />

      <div className="settings-header">
        <span className="settings-tagline">MSSS Admin Console</span>
        <div className="settings-heading">
          <div className="settings-title">
            <FaSitemap />
            <h2>Admin Settings</h2>
          </div>
          <p className="settings-heading-description">
            Maintain procurement categories, streamline hierarchies, and ensure suppliers see accurate groupings across the marketplace.
          </p>
        </div>
        <div className="settings-meta">
          <span className="settings-meta-pill">
            Total Categories: <strong>{formatCount(totalCategories)}</strong>
          </span>
          <span className="settings-meta-pill">
            Root Groups: <strong>{formatCount(topLevelCategoryCount)}</strong>
          </span>
          <span className="settings-meta-pill">
            Subcategories: <strong>{formatCount(subcategoryCount)}</strong>
          </span>
          <span className="settings-meta-pill settings-meta-pill--accent">
            With Items: <strong>{formatCount(populatedCategoryCount)}</strong>
          </span>
        </div>
      </div>
      <p className="settings-subtitle">
        Choose a maintenance tool below—each panel collapses so you can focus on one administrative update at a time.
      </p>

      <div className="settings-tabs">
        <button
          type="button"
          className={`settings-tab ${activeSection === "categories" ? "active" : ""}`.trim()}
          onClick={() => toggleSection("categories")}
        >
          <FaSitemap />
          <span>Manage Categories</span>
          <span className="settings-tab-count">{flattenedCategories.length}</span>
        </button>
        <button type="button" className="settings-tab disabled" disabled>
          More tools soon
        </button>
      </div>

      {activeSection === "categories" && (
        <div className="settings-panel">
          <div className="panel-heading">
            <div className="panel-heading-text">
              <h3>Manage Procurement Categories</h3>
              <p>
                Browse the entire category tree, update names, reassign parents, or remove unused entries. Changes are applied immediately for admins and suppliers.
              </p>
            </div>
            <div className="panel-actions">
              <button type="button" className="panel-primary" onClick={handleOpenAddModal}>
                <FaPlusCircle /> Add Category
              </button>
              <button type="button" className="settings-refresh" onClick={handleRefresh} disabled={loading}>
                <FaSyncAlt /> Refresh
              </button>
              <button type="button" className="panel-hide" onClick={() => toggleSection("categories")}>
                Hide
              </button>
            </div>
          </div>

          <section className="settings-card">
            <header>
              <h3>Category Directory</h3>
              <span>{flattenedCategories.length === 1 ? "1 category" : `${flattenedCategories.length} categories`}</span>
            </header>
            {loading && <p className="settings-placeholder">Loading categories...</p>}
            {error && !loading && <p className="settings-error">{error}</p>}
            {!loading && !error && flattenedCategories.length === 0 && (
              <p className="settings-placeholder">No categories found.</p>
            )}
            {!loading && !error && flattenedCategories.length > 0 && (
              <div className="category-table-wrapper">
                <table className="category-table">
                  <thead>
                    <tr>
                      <th scope="col">Main Category</th>
                      <th scope="col">Subcategories</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topLevelSummaries.map((summary) => {
                      const {
                        node,
                        immediateChildCount,
                        totalDescendants,
                        directItemCount,
                        totalItemCount,
                      } = summary;
                      const hasChildren = immediateChildCount > 0;
                      const nestedSuffix =
                        totalDescendants > immediateChildCount
                          ? ` (incl. ${formatCount(totalDescendants)} nested)`
                          : "";
                      const itemSuffix =
                        totalItemCount > 0
                          ? ` · ${formatCount(totalItemCount)} item${totalItemCount === 1 ? "" : "s"}`
                          : "";
                      const countLabel = `${formatCount(immediateChildCount)}${nestedSuffix}${itemSuffix}`.trim();
                      return (
                        <tr
                          key={node.CategoryID}
                          className={selectedCategoryId === node.CategoryID ? "active-row" : ""}
                        >
                          <td>
                            <button
                              type="button"
                              className="category-name-btn"
                              onClick={() => handleSelectCategory(node.CategoryID)}
                            >
                              {node.CategoryName}
                            </button>
                          </td>
                          <td>
                            <span className="subcategory-count" title={countLabel}>
                              {formatCount(immediateChildCount)}
                              {nestedSuffix}
                              {itemSuffix}
                            </span>
                          </td>
                          <td>
                            <div className="category-action-group">
                              <button
                                type="button"
                                className="category-action"
                                onClick={() => handleOpenEditModal(node.CategoryID)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="category-action"
                                onClick={() => handleOpenAddModal(node.CategoryID)}
                              >
                                Add Subcategory
                              </button>
                              <button
                                type="button"
                                className="category-action"
                                onClick={() => handleOpenSubcategoryManager(node.CategoryID)}
                                disabled={!hasChildren}
                              >
                                Manage Subcategories
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      <AdminCategoryModal
        open={showAddModal}
        onClose={handleCloseAddModal}
        onSubmit={handleCreateCategory}
        title="Add Category"
        icon={<FaPlusCircle />}
        confirmLabel="Add Category"
        pendingLabel="Saving..."
        isSubmitting={isCreating}
        nameValue={createName}
        onNameChange={setCreateName}
        nameInputId="modal-new-category-name"
        parentValue={createParent}
        onParentChange={setCreateParent}
        parentSelectId="modal-new-category-parent"
        parentOptions={parentOptions}
      />

      <AdminCategoryModal
        open={showEditModal}
        onClose={handleCloseEditModal}
        onSubmit={handleUpdateCategory}
        title="Edit Category"
        icon={<FaSave />}
        confirmLabel="Save Changes"
        pendingLabel="Updating..."
        isSubmitting={isSaving}
        nameValue={editName}
        onNameChange={setEditName}
        nameInputId="modal-edit-category-name"
        parentValue={editParent}
        onParentChange={setEditParent}
        parentSelectId="modal-edit-category-parent"
        parentOptions={parentOptions}
        disallowedParentIds={disallowedParentIds}
        parentLabel="Parent"
      />

      <AdminSubcategoryModal
        open={showSubcategoryModal}
        parent={activeSubcategoryParent}
        subcategories={activeSubcategoryItems}
        onClose={handleCloseSubcategoryManager}
        onAddSubcategory={(parentId) => {
          handleCloseSubcategoryManager();
          handleOpenAddModal(parentId);
        }}
        onEditSubcategory={(categoryId) => {
          handleCloseSubcategoryManager();
          handleOpenEditModal(categoryId);
        }}
      />
    </div>
  );
};

export default Settings;
