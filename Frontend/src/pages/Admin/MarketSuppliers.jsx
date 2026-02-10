import React, { useState, useEffect, useMemo } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import "./MarketSuppliers.css";
import SupplierActionHistory from "./SupplierActionHistory";
import Modal from "../../components/Modal"; // Correctly import a real Modal component
import Pagination from "../../components/Pagination";

const backendBase = import.meta.env.VITE_API_URL || "http://localhost:3001";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublicBucket = import.meta.env.VITE_SUPABASE_PUBLIC_BUCKET || "public";

const getSupplierLogo = (supplier) => {
  const raw = supplier?.logoUrl || supplier?.logo || supplier?.logo_url || supplier?.companyLogo || supplier?.logoURL || supplier?.profileImageUrl || null;
  if (!raw || !supabaseUrl) return raw || null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleaned = raw.replace(/^\/+/, "");
  const parts = cleaned.split("/");
  const bucket = parts.length > 1 ? parts[0] : supabasePublicBucket;
  const key = parts.length > 1 ? parts.slice(1).join("/") : cleaned;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;
};

const MarketSuppliers = () => {
  const { token } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null); // To track the selected supplier for the modal
  const [expandedCategories, setExpandedCategories] = useState({}); // row-level expand/collapse
  const [logoPreview, setLogoPreview] = useState(null);
  // const navigate = useNavigate(); // No longer needed if we use a modal

  useEffect(() => {
    const fetchSuppliers = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const res = await api.get(`/api/admin/suppliers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSuppliers(res.data || []);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch suppliers:", err);
        setError("Failed to load suppliers. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchSuppliers();
  }, [token]);

  // Function to handle clicking on a supplier row
  const handleViewHistoryClick = (supplier) => {
    // Instead of navigating, we set the supplier ID to open the modal
    setSelectedSupplier(supplier);
  };

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  const filteredSuppliers = useMemo(() => suppliers.filter((s) => {
    const searchTerm = search.toLowerCase();
    if (!searchTerm) return true; // Show all if search is empty

    const nameMatch = s.name?.toLowerCase().includes(searchTerm);
    const locationMatch = s.location?.toLowerCase().includes(searchTerm);

    const categoryList = Array.isArray(s.categories)
      ? s.categories
      : Array.isArray(s.category)
        ? s.category
        : s.category
          ? [s.category]
          : [];

    const categoryMatch = categoryList.some((cat) => (cat || '').toLowerCase().includes(searchTerm));
    return nameMatch || locationMatch || categoryMatch;
  }), [suppliers, search]);

  const totalSuppliers = filteredSuppliers.length;
  const totalPages = Math.max(1, Math.ceil(totalSuppliers / PAGE_SIZE));
  const startIndex = totalSuppliers === 0 ? 0 : (currentPage - 1) * PAGE_SIZE;
  const paginatedSuppliers = filteredSuppliers.slice(startIndex, startIndex + PAGE_SIZE);
  const endIndex = totalSuppliers === 0 ? 0 : Math.min(totalSuppliers, startIndex + PAGE_SIZE);
  const pageSummary = totalSuppliers === 0
    ? "No suppliers to display"
    : `Showing ${startIndex + 1}-${endIndex} of ${totalSuppliers}`;
  const showPagination = totalSuppliers > 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="market-suppliers-container">
      {/* Header */}
      <header className="market-suppliers-header">
        <span className="market-suppliers-tagline">MSSS Admin Console</span>
        <div className="market-suppliers-heading">
          <h2>Supplier Directory</h2>
          <p>Review accredited suppliers, monitor their categories, and launch action history without leaving the page.</p>
        </div>
        <div className="market-suppliers-meta">
          <span className="meta-pill">
            Total Suppliers: <strong>{suppliers.length}</strong>
          </span>
          {filteredSuppliers.length !== suppliers.length && (
            <span className="meta-pill meta-pill--highlight">
              Showing {filteredSuppliers.length} matches
            </span>
          )}
        </div>
      </header>

      {/* Search Bar */}
      <div className="market-suppliers-search">
        <input
          type="text"
          placeholder="Search by name, category, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showPagination && !isLoading && (
        <div className="pagination-wrapper top">
          <div className="pagination-summary">{pageSummary}</div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showPreview
            previewCount={7}
          />
        </div>
      )}

      {/* Supplier Table */}
      <div className="supplier-table-container">
        <table className="supplier-table">
          <thead>
            <tr>
              <th>Supplier Name</th>
              <th>Email</th>
              <th>Category</th>
              <th>Location</th>
              <th>Total Products</th>
              <th>History</th>
              <th>Status</th>
              <th>Date Joined</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="8" className="no-results">
                  <div className="table-loading">
                    <div className="loading-spinner" aria-hidden />
                    <span>Loading suppliers...</span>
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="8" className="no-results" style={{ color: 'red' }}>
                  {error}
                </td>
              </tr>
            ) : filteredSuppliers.length > 0 ? (
               paginatedSuppliers.map((supplier) => {
                const logoSrc = getSupplierLogo(supplier);
                const logoInitial = (supplier.name || "?").charAt(0).toUpperCase();
                const categoryList = Array.isArray(supplier.categories)
                  ? supplier.categories
                  : Array.isArray(supplier.category)
                    ? supplier.category
                    : supplier.category
                      ? [supplier.category]
                      : [];
                return (
                <tr key={supplier.id}>
                  <td data-label="Supplier Name">
                    <div className="supplier-name-cell">
                      <div className={`supplier-logo ${logoSrc ? "" : "fallback"}`} aria-hidden>
                        {logoSrc ? (
                          <img
                            src={logoSrc}
                            alt=""
                            role="button"
                            onClick={(e) => { e.stopPropagation(); setLogoPreview(logoSrc); }}
                            onError={(e) => {
                              const el = e.currentTarget.closest('.supplier-logo');
                              if (el) el.classList.add('fallback');
                            }}
                          />
                        ) : null}
                        <span>{logoInitial}</span>
                      </div>
                      <span className="supplier-name-text">{supplier.name}</span>
                    </div>
                  </td>
                  <td data-label="Email">{supplier.email}</td>
                  <td data-label="Category">
                    {categoryList.length > 0 ? (
                      <div className={`category-cell ${expandedCategories[supplier.id] ? "expanded" : ""}`}>
                        <span className="category-text">
                          {expandedCategories[supplier.id]
                            ? categoryList.join(', ')
                            : categoryList.slice(0, 2).join(', ')}
                        </span>
                        {categoryList.length > 2 && (
                          <button
                            className="table-link inline"
                            onClick={() => setExpandedCategories(prev => ({
                              ...prev,
                              [supplier.id]: !prev[supplier.id],
                            }))}
                          >
                            {expandedCategories[supplier.id] ? 'View less' : 'View more'}
                          </button>
                        )}
                      </div>
                    ) : 'N/A'}
                  </td>
                  <td data-label="Location">{supplier.location || "N/A"}</td>
                  <td data-label="Total Products">{supplier.totalProducts}</td>
                  <td data-label="History">
                    <button onClick={() => handleViewHistoryClick(supplier)} className="view-history-btn">
                      View History
                    </button>
                  </td>
                  <td data-label="Status">
                    <span
                      className={`status-badge ${supplier.status?.toLowerCase()}`}
                    >
                      {supplier.status}
                    </span>
                  </td>
                  <td data-label="Date Joined">
                    {new Date(supplier.dateJoined).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              )})
            ) : (
              <tr>
                <td colSpan="8" className="no-results">
                  No suppliers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

        {showPagination && !isLoading && (
          <div className="pagination-wrapper">
            <div className="pagination-summary">{pageSummary}</div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              showPreview
              previewCount={7}
            />
          </div>
        )}

      {/* Modal for Supplier Action History */}
      {selectedSupplier && (
        <Modal
          show={!!selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
          title={`Action History for ${selectedSupplier.name}`}>
          <SupplierActionHistory supplierId={selectedSupplier.id} />
        </Modal>
      )}

      {logoPreview && (
        <div className="logo-preview-overlay" onClick={() => setLogoPreview(null)}>
          <div className="logo-preview" onClick={(e) => e.stopPropagation()}>
            <button className="logo-preview-close" onClick={() => setLogoPreview(null)} aria-label="Close image">✖</button>
            <img src={logoPreview} alt="Supplier logo" />
          </div>
        </div>
      )}

    </div>
  );
};


export default MarketSuppliers;
