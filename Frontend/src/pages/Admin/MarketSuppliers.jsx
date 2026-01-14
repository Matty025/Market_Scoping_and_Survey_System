import React, { useState, useEffect, useMemo } from "react";
import api from "../../api";
import { useAuth } from "../../components/AuthContext";
import "./MarketSuppliers.css";
import SupplierActionHistory from "./SupplierActionHistory";
import Modal from "../../components/Modal"; // Correctly import a real Modal component

const backendBase = import.meta.env.VITE_API_URL || "http://localhost:3001";

const MarketSuppliers = () => {
  const { token } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null); // To track the selected supplier for the modal
  const [selectedCategories, setSelectedCategories] = useState(null);
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

  const filteredSuppliers = useMemo(() => suppliers.filter((s) => {
    const searchTerm = search.toLowerCase();
    if (!searchTerm) return true; // Show all if search is empty

    const nameMatch = s.name?.toLowerCase().includes(searchTerm);
    const locationMatch = s.location?.toLowerCase().includes(searchTerm);

    let categoryMatch = false;
    if (s.category) {
      if (Array.isArray(s.category)) {
        // If 'category' is an array, check if any item in the array matches
        categoryMatch = s.category.some(cat => cat.toLowerCase().includes(searchTerm));
      } else if (typeof s.category === 'string') {
        // If 'category' is a string, perform a simple check
        categoryMatch = s.category.toLowerCase().includes(searchTerm);
      }
    }
    return nameMatch || locationMatch || categoryMatch;
  }), [suppliers, search]);

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
                <td colSpan="8" className="no-results">Loading suppliers...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="8" className="no-results" style={{ color: 'red' }}>
                  {error}
                </td>
              </tr>
            ) : filteredSuppliers.length > 0 ? (
               filteredSuppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.email}</td>
                  <td>
                    {Array.isArray(supplier.category) && supplier.category.length ? (
                      <>
                        {supplier.category.slice(0, 2).join(', ')}
                        {supplier.category.length > 2 && (
                          <button className="table-link inline" onClick={() => setSelectedCategories(supplier)}>
                            View more
                          </button>
                        )}
                      </>
                    ) : supplier.category || 'N/A'}
                  </td>
                  <td>{supplier.location || "N/A"}</td>
                  <td>{supplier.totalProducts}</td>
                  <td>
                    <button onClick={() => handleViewHistoryClick(supplier)} className="view-history-btn">
                      View History
                    </button>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${supplier.status?.toLowerCase()}`}
                    >
                      {supplier.status}
                    </span>
                  </td>
                  <td>
                    {new Date(supplier.dateJoined).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              ))
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

      {/* Modal for Supplier Action History */}
      {selectedSupplier && (
        <Modal
          show={!!selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
          title={`Action History for ${selectedSupplier.name}`}>
          <SupplierActionHistory supplierId={selectedSupplier.id} />
        </Modal>
      )}

      {selectedCategories && (
        <Modal
          show={!!selectedCategories}
          onClose={() => setSelectedCategories(null)}
          title={`Categories for ${selectedCategories.name}`}
        >
          <div className="category-list">
            {(selectedCategories.category || []).map((cat, idx) => (
              <span key={idx} className="category-pill">{cat}</span>
            ))}
            {!selectedCategories.category?.length && <p>No categories found.</p>}
          </div>
        </Modal>
      )}

    </div>
  );
};


export default MarketSuppliers;
