// Clean version with unified filter and dynamic categories
import React, { useState, useEffect } from "react";
import axios from "axios";
import AnnouncementForm from "../../components/AnnouncementForm";
import StatsSection from "../../components/StatsSection";
import ResponseModal from "../../components/ResponseModal";
import { useAuth } from "../../components/AuthContext";
import Toast from "../../components/Toast";
import { FaUsers, FaBoxOpen, FaCheckCircle, FaClock, FaClipboardList, FaTag, FaUserCheck } from "react-icons/fa";
import "./Dashboard.css";

const PAGE_SIZE = 50;
const PARENT_CATEGORY_NAMES = new Set(["GOODS", "INFRASTRUCTURE PROJECTS", "CONSULTING SERVICES"]);

const parseAnnouncementsResponse = (payload) => {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      total: payload.length,
      page: 1,
      limit: payload.length
    };
  }

  if (!payload || typeof payload !== "object") {
    return { items: [], total: 0, page: 1, limit: PAGE_SIZE };
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  const total = Number(payload.total ?? payload.count ?? items.length) || 0;
  const page = Number(payload.page ?? payload.currentPage ?? 1) || 1;
  const limit = Number(payload.limit ?? payload.pageSize ?? PAGE_SIZE) || PAGE_SIZE;

  return { items, total, page, limit };
};

const CategoryModal = ({ categories, onClose }) => {
  const groupedCategories = {
    "GOODS": [],
    "INFRASTRUCTURE PROJECTS": [],
    "CONSULTING SERVICES": [],
    "Other": []
  };

  categories.forEach(cat => {
    const catUpper = cat.toUpperCase();
    
    if (catUpper === "UNCATEGORIZED" || catUpper === "SUPPLIER-SPECIFIC") {
      return;
    }
    
    if (catUpper === "GOODS" || catUpper === "INFRASTRUCTURE PROJECTS" || catUpper === "CONSULTING SERVICES") {
      return;
    }
    
    if (["OFFICE SUPPLIES & DEVICES", "IT EQUIPMENT & PERIPHERALS", "EDUCATIONAL & INSTRUCTIONAL MATERIALS",
         "FURNITURE & FIXTURES", "SPORTS & PHYSICAL EDUCATION EQUIPMENT", "LABORATORY EQUIPMENT & SUPPLIES",
         "ELECTRICAL & ELECTRONIC SUPPLIES", "CLEANING & JANITORIAL SUPPLIES", "MEDICAL & FIRST AID SUPPLIES",
         "VEHICLES, TOOLS & MACHINERY", "PRINTING & REPRODUCTION SERVICES", "UNIFORMS, APPAREL & FABRICS",
         "FOOD & CATERING SUPPLIES", "GENERAL SUPPORT SERVICES"].includes(catUpper)) {
      groupedCategories["GOODS"].push(cat);
    }
    else if (["SCHOOL BUILDING CONSTRUCTION", "SCHOOL BUILDING REHABILITATION", "WATER SUPPLY & SANITATION SYSTEMS",
              "ELECTRICAL & POWER SYSTEMS", "SITE DEVELOPMENT & LANDSCAPING", "ROOFING AND PAINTING WORKS",
              "MINOR REPAIRS & MAINTENANCE WORK"].includes(catUpper)) {
      groupedCategories["INFRASTRUCTURE PROJECTS"].push(cat);
    }
    else if (["ARCHITECTURAL & ENGINEERING DESIGN", "FEASIBILITY & PROJECT STUDIES", "CONSTRUCTION SUPERVISION",
              "ICT SYSTEM DEVELOPMENT", "RESEARCH & EVALUATION STUDIES"].includes(catUpper)) {
      groupedCategories["CONSULTING SERVICES"].push(cat);
    }
    else {
      groupedCategories["Other"].push(cat);
    }
  });

  const totalCategories = Object.values(groupedCategories).reduce((sum, cats) => sum + cats.length, 0);

  return (
    <div className="modal-overlay" onClick={(e) => e.target.classList.contains("modal-overlay") && onClose()}>
      <div className="modal" style={{ maxWidth: "600px" }}>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          ✖
        </button>
        <h3 style={{ marginBottom: "20px" }}>📁 Categories ({totalCategories})</h3>
        <div style={{ maxHeight: "500px", overflowY: "auto", padding: "10px" }}>
          {totalCategories === 0 ? (
            <p style={{ textAlign: "center", color: "#666", padding: "20px" }}>
              No categories assigned to this announcement
            </p>
          ) : (
            <>
              {Object.entries(groupedCategories).map(([parent, subcats]) => {
                if (subcats.length === 0) return null;
                return (
                  <div key={parent} style={{ marginBottom: "25px" }}>
                    <h4 style={{
                      fontSize: "16px",
                      fontWeight: "bold",
                      color: "#1f2937",
                      marginBottom: "10px",
                      paddingBottom: "8px",
                      borderBottom: "2px solid #3b82f6"
                    }}>
                      {parent}
                    </h4>
                    <ul style={{ listStyle: "none", padding: 0, paddingLeft: "15px" }}>
                      {subcats.map((cat, idx) => (
                        <li
                          key={idx}
                          style={{
                            padding: "8px 12px",
                            margin: "5px 0",
                            background: "#f9fafb",
                            borderRadius: "6px",
                            border: "1px solid #e5e7eb",
                            fontSize: "14px"
                          }}
                        >
                          └─ {cat}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const AnnouncementCard = ({ announcement, onShowCategories, onShowSuppliers }) => {
  const rawCats = announcement.categories || announcement.categoryDisplay || announcement.category || "";
  const isSupplierSpecific = announcement.sendType === "supplier" || announcement.SendType === "supplier";
  const supplierNames = Array.isArray(announcement.suppliers) ? announcement.suppliers : [];
  const responseCountRaw = announcement.responseCount ?? announcement.responsecount ?? announcement.responses ?? 0;
  const responseCountNum = Number(responseCountRaw);
  const responseCount = Number.isNaN(responseCountNum) ? 0 : responseCountNum;
  const hasResponses = announcement.hasResponses ?? responseCount > 0;
  const isExpired = Boolean(announcement.isExpired ?? announcement.isexpired ?? false);
  const cardClassName = isExpired ? "announcement-card expired" : "announcement-card";
  
  const seenCategories = new Set();
  const catsArr = isSupplierSpecific ? [] : String(rawCats)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => {
      const upper = s.toUpperCase();
      if (upper === "UNCATEGORIZED" || upper === "SUPPLIER-SPECIFIC") {
        return false;
      }
      if (PARENT_CATEGORY_NAMES.has(upper)) {
        return false;
      }
      if (seenCategories.has(upper)) {
        return false;
      }
      seenCategories.add(upper);
      return true;
    });

  const firstTwoSuppliers = supplierNames.slice(0, 2);
  const remainingSuppliers = Math.max(0, supplierNames.length - firstTwoSuppliers.length);

  return (
    <div className={cardClassName}>
      <div className="announcement-header">
        <h4>{announcement.title}</h4>
        <div className="announcement-header-right">
          {isExpired && (
            <span className="badge badge-expired">Failed Posting</span>
          )}
          {isSupplierSpecific ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="badge" style={{ backgroundColor: "#8b5cf6" }}>
                {supplierNames.length === 0
                  ? "No suppliers"
                  : supplierNames.length <= 2
                    ? `👥 Sent to ${supplierNames.join(", ")}`
                    : `👥 Sent to ${firstTwoSuppliers.join(", ")} +${remainingSuppliers} more`}
              </span>
              {supplierNames.length > 0 && (
                <button
                  className="see-more-btn"
                  style={{ fontSize: "12px", padding: "4px 12px", margin: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowSuppliers?.(supplierNames);
                  }}
                >
                  View
                </button>
              )}
            </div>
          ) : catsArr.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="badge">
                {catsArr.length} {catsArr.length === 1 ? "category" : "categories"}
              </span>
              <button
                className="see-more-btn"
                style={{ 
                  fontSize: "12px", 
                  padding: "4px 12px",
                  margin: 0
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowCategories(catsArr);
                }}
              >
                View
              </button>
            </div>
          ) : (
            <span className="badge" style={{ backgroundColor: "#6b7280" }}>
              No categories
            </span>
          )}
        </div>
      </div>
      <p><strong>Description:</strong> {announcement.description}</p>
      <p><strong>Posted:</strong> {announcement.posted}</p>
      <p><strong>End:</strong> {announcement.end}</p>
      <p>
        <strong>Responses:</strong> {hasResponses ? `${responseCount} supplier${responseCount === 1 ? "" : "s"} responded` : "No responses yet"}
      </p>
      {(announcement.file?.name || announcement.fileName) && (
        <p>📎 {announcement.file?.name || announcement.fileName}</p>
      )}
    </div>
  );
};

const SupplierModal = ({ suppliers, onClose }) => (
  <div className="modal-overlay" onClick={(e) => e.target.classList.contains("modal-overlay") && onClose()}>
    <div className="modal" style={{ maxWidth: "500px" }}>
      <button type="button" className="modal-close-btn" onClick={onClose}>✖</button>
      <h3 style={{ marginBottom: 12 }}>👥 Sent To ({suppliers.length})</h3>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {suppliers.length === 0 ? (
          <p style={{ color: "#666" }}>No suppliers listed.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {suppliers.map((name, idx) => (
              <li key={idx} style={{
                padding: "8px 12px",
                margin: "6px 0",
                background: "#f9fafb",
                borderRadius: 6,
                border: "1px solid #e5e7eb"
              }}>
                {name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </div>
);

const CollapsibleSection = ({ title, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible-section">
      <div className="collapsible-header" onClick={() => setOpen(!open)}>
        <h4>{title}</h4>
        <span>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div className="collapsible-content">{children}</div>}
    </div>
  );
};

const Dashboard = () => {
  const { token } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [postedDate, setPostedDate] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [responses, setResponses] = useState([]);
  const [isResponseLoading, setIsResponseLoading] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });
  const [categoryMap, setCategoryMap] = useState({});
  const [categoryNameToId, setCategoryNameToId] = useState({});
  const [fileCategoryMap, setFileCategoryMap] = useState({});
  const [categoryHierarchy, setCategoryHierarchy] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [modalCategories, setModalCategories] = useState([]);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [modalSuppliers, setModalSuppliers] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalAnnouncements, setTotalAnnouncements] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter, searchQuery, postedDate]);

  const formatAnnouncementRecord = (ann, overrides = {}) => {
    const categoryLookup = overrides.categoryMap ?? categoryMap;
    const fileCategoryLookup = overrides.fileCategoryMap ?? fileCategoryMap;
    const postedRaw = ann.DatePosted || ann.posted || ann.datePosted;
    const endRaw = ann.EndDate || ann.end || ann.endDate;
    const postedDateObj = postedRaw ? new Date(postedRaw) : null;
    const endDateObj = endRaw ? new Date(endRaw) : null;
    const postedStr = postedDateObj
      ? postedDateObj.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "N/A";
    const endStr = endDateObj
      ? endDateObj.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : "N/A";

    const fileKey = ann.FileID ?? ann.fileId ?? ann.fileID ?? ann.id;
    const fileCats = fileCategoryLookup[fileKey];

    const sendType = ann.sendType || ann.SendType || ann.send_type;

    const responseCountRaw = ann.responseCount ?? ann.responsecount ?? ann.responses ?? 0;
    const responseCountNum = Number(responseCountRaw);
    const responseCount = Number.isNaN(responseCountNum) ? 0 : responseCountNum;

    const backendExpired = ann.isExpired ?? ann.isexpired;
    let isExpired = false;
    if (typeof backendExpired === "boolean") {
      isExpired = backendExpired;
    } else if (typeof backendExpired === "string") {
      const normalized = backendExpired.trim().toLowerCase();
      isExpired = normalized === "true" || normalized === "t" || normalized === "1";
    } else if (typeof backendExpired === "number") {
      isExpired = backendExpired === 1;
    } else {
      isExpired = endDateObj ? endDateObj.getTime() < Date.now() : false;
    }

    let displayText = "Uncategorized";
    if (sendType === "supplier") {
      displayText = "Supplier-specific";
    } else {
      displayText = ann.categories || ann.categoryName || (fileCats && fileCats.length
        ? fileCats.join(", ")
        : (categoryLookup[ann.CategoryID] || categoryLookup[ann.categoryId] || ann.category || "Uncategorized"));
    }

    return {
      ...ann,
      posted: postedStr,
      end: endStr,
      categoryDisplay: displayText,
      sendType,
      suppliers: Array.isArray(ann.suppliers) ? ann.suppliers : [],
      responseCount,
      hasResponses: responseCount > 0,
      isExpired,
    };
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        const announcementParams = { page: 1, limit: PAGE_SIZE };
        const [announcementsRes, statsRes, categoriesRes, fileCatsRes, suppliersRes] = await Promise.all([
          axios.get("http://localhost:3001/api/admin/announcements", { headers: { Authorization: `Bearer ${token}` }, params: announcementParams }),
          axios.get("http://localhost:3001/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } }),
          axios.get("http://localhost:3001/api/admin/categories", { headers: { Authorization: `Bearer ${token}` } }),
          axios.get("http://localhost:3001/api/admin/file-categories", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
          axios.get("http://localhost:3001/api/admin/suppliers", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const catMap = {};
        const nameToId = {};
        const hierarchy = [];
        
        (categoriesRes.data || []).forEach((parent) => {
          catMap[parent.CategoryID] = parent.CategoryName;
          nameToId[parent.CategoryName] = parent.CategoryID;
          
          // Build hierarchy for filter dropdown
          hierarchy.push({
            id: parent.CategoryID,
            name: parent.CategoryName,
            isParent: true
          });
          
          (parent.Subcategories || []).forEach((child) => {
            catMap[child.CategoryID] = child.CategoryName;
            nameToId[child.CategoryName] = child.CategoryID;
            
            hierarchy.push({
              id: child.CategoryID,
              name: child.CategoryName,
              isParent: false,
              parentName: parent.CategoryName
            });
          });
        });
        
        setCategoryMap(catMap);
        setCategoryNameToId(nameToId);
        setCategoryHierarchy(hierarchy);

        // Build supplier options
        const uniqueSuppliersMap = {};
        (suppliersRes.data || []).forEach((s) => {
          if (!uniqueSuppliersMap[s.id]) {
            uniqueSuppliersMap[s.id] = { id: s.id, name: s.name };
          }
        });
        setSupplierOptions(Object.values(uniqueSuppliersMap));

        const fMap = {};
        (fileCatsRes.data || []).forEach((rec) => {
          const fid = rec.FileID ?? rec.fileId ?? rec.fileID;
          const cname = rec.CategoryName ?? catMap[rec.CategoryID ?? rec.categoryId];
          if (!fid) return;
          if (!fMap[fid]) fMap[fid] = [];
          if (cname) fMap[fid].push(cname);
        });
        setFileCategoryMap(fMap);

        const { items: announcementItems, total: totalFromResponse, page: pageFromResponse } = parseAnnouncementsResponse(announcementsRes.data);

        const formattedAnnouncements = (announcementItems || []).map((ann) => formatAnnouncementRecord(ann, {
          categoryMap: catMap,
          fileCategoryMap: fMap,
        }));

        setAnnouncements(formattedAnnouncements);
        setTotalAnnouncements(totalFromResponse);
        setCurrentPage(pageFromResponse);

        const s = statsRes.data || {};
        setStats([
          { label: "Total Suppliers", value: s.totalSuppliers || 0, icon: <FaUsers />, bgColor: "#2563eb" },
          { label: "Total Products", value: s.totalProducts || 0, icon: <FaBoxOpen />, bgColor: "#3b82f6" },
          { label: "Active Announcements", value: s.activeAnnouncements || 0, icon: <FaClock />, bgColor: "#60a5fa" },
          { label: "Pending Responses", value: s.pendingResponses || 0, icon: <FaClipboardList />, bgColor: "#1d4ed8" },
          { label: "Answered Responses", value: s.answeredResponses || 0, icon: <FaCheckCircle />, bgColor: "#93c5fd" },
          { label: "Total Categories", value: s.totalCategories || 0, icon: <FaTag />, bgColor: "#3b82f6" },
          { label: "Pending Accounts", value: s.pendingAccounts || 0, icon: <FaUserCheck />, bgColor: "#2563eb" },
        ]);

        setError(null);
      } catch (err) {
        setError("Failed to fetch dashboard data.");
        setToast({ visible: true, type: "error", message: "Failed to load dashboard data" });
        console.error("❌ Fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboardData();
  }, [token]);

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      try {
        const params = { page: currentPage, limit: PAGE_SIZE };
        if (searchQuery.trim()) params.search = searchQuery.trim();
        
        if (selectedFilter && selectedFilter !== "All") {
          if (selectedFilter.startsWith("supplierId:")) {
            const supplierIdStr = selectedFilter.replace("supplierId:", "");
            const sid = parseInt(supplierIdStr, 10);
            if (!Number.isNaN(sid)) params.supplierId = sid;
          } else if (selectedFilter.startsWith("supplier:")) {
            // Backward compatibility if any existing state persists
            const supplierName = selectedFilter.replace("supplier:", "");
            params.supplierName = supplierName;
          } else if (selectedFilter.startsWith("category:")) {
            const categoryName = selectedFilter.replace("category:", "");
            const cid = categoryNameToId[categoryName];
            if (cid) params.categoryId = cid;
          }
        }
        
        if (postedDate) {
          params.from = postedDate;
          params.to = postedDate;
        }

        const announcementsRes = await axios.get("http://localhost:3001/api/admin/announcements", {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });

        const { items, total, page } = parseAnnouncementsResponse(announcementsRes.data);
        const formatted = (items || []).map(formatAnnouncementRecord);
        setAnnouncements(formatted);
        setTotalAnnouncements(total);
        setCurrentPage(page);
      } catch (e) {
        console.warn("Failed to fetch filtered announcements", e);
      }
    };
    run();
  }, [selectedFilter, searchQuery, postedDate, token, categoryNameToId, categoryMap, fileCategoryMap, currentPage, refreshKey]);

  const handlePostAnnouncement = async (formData) => {
    const data = new FormData();
    data.append("title", formData.title);
    data.append("description", formData.description);
    data.append("file", formData.file);
    if (formData.end) {
      data.append("end", formData.end);
    }

    if (formData.categories && formData.categories.length > 0) {
      data.append("categories", JSON.stringify(formData.categories));
    }

    if (formData.sendType === "supplier") {
      const supplierIds = formData.suppliers.filter((id) => id !== "all");
      data.append("suppliers", JSON.stringify(supplierIds));
      data.append("sendType", "supplier");
    } else if (formData.sendType === "category") {
      data.append("sendType", "category");
    }

    try {
      const response = await axios.post("http://localhost:3001/api/admin/announcements", data, {
        headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` },
      });
      setShowModal(false);
      setToast({ visible: true, type: "success", message: "Announcement posted successfully" });
      setCurrentPage(1);
      setRefreshKey((key) => key + 1);
    } catch (err) {
      console.error("❌ Failed to post announcement:", err);
      const errorMsg = err.response?.data?.message || "An error occurred.";
      setToast({ visible: true, type: "error", message: `Failed to post announcement: ${errorMsg}` });
    }
  };

  const handleOpenResponseModal = async (announcement) => {
    setSelectedAnnouncement(announcement);
    setIsResponseLoading(true);
    try {
      const response = await axios.get(`http://localhost:3001/api/admin/announcements/${announcement.id}/responses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResponses(response.data);
    } catch (error) {
      console.error("❌ Failed to fetch responses:", error);
      setToast({ visible: true, type: "warning", message: "Could not load supplier responses" });
    } finally {
      setIsResponseLoading(false);
    }
  };

  const handleCloseResponseModal = () => setSelectedAnnouncement(null);

  const handleShowCategories = (categories) => {
    setModalCategories(categories);
    setShowCategoryModal(true);
  };

  const handleShowSuppliers = (suppliers) => {
    setModalSuppliers(suppliers);
    setShowSupplierModal(true);
  };

  const totalPages = Math.max(1, Math.ceil((totalAnnouncements || 0) / PAGE_SIZE));
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;
  const startItemIndex = totalAnnouncements === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItemIndex = totalAnnouncements === 0 ? 0 : Math.min(totalAnnouncements, currentPage * PAGE_SIZE);

  const handlePrevPage = () => {
    if (canGoPrev) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (canGoNext) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  return (
    <div className="dashboard-container">
      <Toast type={toast.type} message={toast.message} visible={toast.visible} onClose={() => setToast({ ...toast, visible: false })} duration={3000} />
      <div className="dashboard-header">
        <h2>📊 Dashboard Overview</h2>
        <p>Welcome! Here's a summary of your procurement activities.</p>
      </div>

      <StatsSection stats={stats} />

      {isLoading && <p>Loading dashboard data...</p>}
      {error && <p className="error-message">{error}</p>}

      <CollapsibleSection title={`📢 Recent Procurement Announcements (${announcements.length})`}>
        <div className="dashboard-filters">
          <div className="filters-left">
            <button className="post-btn" onClick={() => setShowModal(true)}>
              + Post Announcement
            </button>
          </div>
          <div className="filters-right">
            <input 
              type="text" 
              placeholder="Search title or description..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="filter-input" 
            />
            
            <select 
              value={selectedFilter} 
              onChange={(e) => setSelectedFilter(e.target.value)} 
              className="filter-select"
              style={{ minWidth: "200px" }}
            >
              <option value="All">📋 All Announcements</option>
              
              <optgroup label="📁 BY CATEGORY">
                {categoryHierarchy.map((cat) => (
                  <option 
                    key={`category:${cat.name}`} 
                    value={`category:${cat.name}`}
                    style={{ paddingLeft: cat.isParent ? "5px" : "20px" }}
                  >
                    {cat.isParent ? `${cat.name}` : `└─ ${cat.name}`}
                  </option>
                ))}
              </optgroup>
              
              <optgroup label="👥 BY SUPPLIER">
                {supplierOptions.map((sup) => (
                  <option key={`supplierId:${sup.id}`} value={`supplierId:${sup.id}`}>
                    {sup.name}
                  </option>
                ))}
              </optgroup>
            </select>
            
            <input 
              type="date" 
              value={postedDate} 
              onChange={(e) => setPostedDate(e.target.value)} 
              className="filter-date" 
              title="Filter by posted date"
            />
            
            {(searchQuery || selectedFilter !== "All" || postedDate) && (
              <button 
                type="button" 
                className="see-more-btn" 
                onClick={() => { 
                  setSearchQuery(""); 
                  setSelectedFilter("All"); 
                  setPostedDate(""); 
                }} 
                title="Clear filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {announcements.length === 0 ? (
          <p>No announcements found.</p>
        ) : (
          <div className="announcements-container">
            {announcements.map((ann) => (
              <div key={ann.id} onClick={() => handleOpenResponseModal(ann)}>
                <AnnouncementCard
                  announcement={ann}
                  onShowCategories={handleShowCategories}
                  onShowSuppliers={handleShowSuppliers}
                />
              </div>
            ))}
          </div>
        )}

        <div className="pagination-controls">
          <div className="pagination-info">
            {totalAnnouncements === 0
              ? "No announcements to display"
              : `Showing ${startItemIndex}-${endItemIndex} of ${totalAnnouncements}`}
          </div>
          <div className="pagination-buttons">
            <button
              type="button"
              className="pagination-button"
              onClick={handlePrevPage}
              disabled={!canGoPrev}
            >
              Previous
            </button>
            <span className="pagination-page">Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              className="pagination-button"
              onClick={handleNextPage}
              disabled={!canGoNext}
            >
              Next
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {showModal && (
        <div className="modal-overlay" onClick={(e) => (e.target.classList.contains("modal-overlay") || e.target.classList.contains("modal-close-btn")) && setShowModal(false)}>
          <div className="modal">
            <button type="button" className="modal-close-btn" onClick={() => setShowModal(false)}>
              ✖
            </button>
            <AnnouncementForm onSubmit={handlePostAnnouncement} onCancel={() => setShowModal(false)} />
          </div>
        </div>
      )}

      {selectedAnnouncement && (
        <ResponseModal announcement={selectedAnnouncement} responses={responses} isLoading={isResponseLoading} onClose={handleCloseResponseModal} />
      )}

      {showCategoryModal && (
        <CategoryModal categories={modalCategories} onClose={() => setShowCategoryModal(false)} />
      )}

      {showSupplierModal && (
        <SupplierModal suppliers={modalSuppliers} onClose={() => setShowSupplierModal(false)} />
      )}
    </div>
  );
};

export default Dashboard;