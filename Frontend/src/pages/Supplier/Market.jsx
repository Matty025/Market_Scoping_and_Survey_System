import React, { useState, useEffect, useMemo } from "react";
import api from "../../api";
import dayjs from "dayjs";
import { useAuth } from "../../components/AuthContext";
import AddProductForm from "./AddProductForm"; 
// 💡 IMPORTANT: Assuming 'react-hot-toast' is installed and used across the app
import toast from 'react-hot-toast'; 
import "./Market.css";

// --- CONFIGURATION ---
const PAGE_SIZE = 50; 

const formatDate = (value) => {
    if (!value) {
        return 'N/A';
    }
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('MMM D, YYYY') : 'N/A';
};

const getEffectiveSummary = (product) => {
    const effectiveRaw = product?.effectiveUntil || product?.effective_until;
    if (!effectiveRaw) return null;

    const effectiveDate = dayjs(effectiveRaw);
    if (!effectiveDate.isValid()) return null;

    const now = dayjs().startOf('day');
    const effectiveStart = effectiveDate.startOf('day');
    const daysRemaining = effectiveStart.diff(now, 'day');

    const lastActivity = dayjs(product?.dateUpdated || product?.datePosted);
    const lastActivityStart = lastActivity.isValid() ? lastActivity.startOf('day') : null;
    const totalWindow = lastActivityStart ? Math.max(effectiveStart.diff(lastActivityStart, 'day'), 0) : null;

    const isExpired = daysRemaining <= 0;
    const badgeClass = isExpired ? 'effective-badge-expired' : 'effective-badge-active';
    const badgeLabel = isExpired
        ? (daysRemaining === 0 ? 'Expired Today' : 'Past Effective')
        : 'Effective';
    const statusMessage = isExpired
        ? `Past effective since ${effectiveDate.format('MMM D, YYYY')}`
        : `Effective until ${effectiveDate.format('MMM D, YYYY')}`;

    return {
        badgeClass,
        badgeLabel,
        statusMessage,
        totalWindow,
        formattedDate: effectiveDate.format('MMM D, YYYY'),
        isExpired,
        daysRemaining,
    };
};

// 💡 NEW TOAST WRAPPER: Use the actual toast utility instead of alert/showToast
const notify = (message, type = 'info') => {
    if (type === 'success') {
        toast.success(message);
    } else if (type === 'error') {
        toast.error(message);
    } else if (type === 'warning') {
        toast.custom(<div style={{ background: '#f59e0b', color: 'white', padding: '10px', borderRadius: '8px' }}>{message}</div>);
    } else {
        toast(message);
    }
};

const SupplierMarket = () => {
    const { token } = useAuth();

    // 1. Data States
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]); // This holds the DB categories

    // 2. Control States (Filtering & Sorting)
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState(""); 
    const [sortBy, setSortBy] = useState("recent");
    
    // 3. Pagination States
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);

    // 4. UI/Modal States
    const [showAddModal, setShowAddModal] = useState(false);
    const [editProduct, setEditProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Upload state
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);

    // New state to hold categories grouped for display
    const [groupedCategories, setGroupedCategories] = useState({});


    // --- FETCH LOGIC ---
    const fetchProducts = async (page = currentPage) => {
        if (!token) return;

        setLoading(true);
        setError(null);
        
        const params = { page, q: search };
        if (categoryFilter) params.categoryStatus = categoryFilter;

        try {
            const res = await api.get(`/api/supplier-files/items`, { params });

            const normalizedItems = (res.data.items || []).map((item) => ({
                ...item,
                datePosted: item.datePosted || item.dateposted || item.date || null,
                dateUpdated: item.dateUpdated || item.dateupdated || item.date || null,
                effectiveUntil: item.effectiveUntil || item.effectiveuntil || null,
                date: item.date || item.dateUpdated || item.datePosted || null,
            }));

            setProducts(normalizedItems);
            setTotalItems(res.data.totalItems || 0);
            setCurrentPage(res.data.currentPage);
            
        } catch (err) {
            console.error("Fetch products error:", err);
            const errorMsg = err.response?.data?.message || "Failed to load products";
            notify(errorMsg, 'error'); // Using notify
        } finally {
            setLoading(false);
        }
    };
    
    const fetchCategories = async () => {
        if (!token) return;
        try {
            const res = await api.get(`/api/supplier-files/categories`);
            const groupedCategories = res.data.reduce((acc, cat) => {
                // Assuming ParentCategoryID is the grouping key
                const parentId = cat.ParentCategoryID || 'GOODS'; 
                if (!acc[parentId]) {
                    acc[parentId] = [];
                }
                acc[parentId].push(cat.CategoryName);
                return acc;
            }, {});
            setCategories(res.data || []); 
            setGroupedCategories(groupedCategories); 
        } catch (err) {
            console.error("Fetch categories error:", err);
        }
    };

    // --- EFFECTS ---
    useEffect(() => {
        if (token) {
            fetchProducts();
            fetchCategories();
        }
    }, [token, search, categoryFilter, currentPage]); 


    // 💡 ENHANCED DELETE HANDLER
    const handleDelete = (id, name) => {
        // Use a persistent toast for confirmation instead of window.confirm
        toast((t) => (
            <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                    Are you sure you want to delete <strong>{name}</strong>?
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button 
                        onClick={() => {
                            toast.dismiss(t.id); // Close the confirmation toast
                            performDeletion(id); // Execute deletion
                        }}
                        style={{ padding: '8px 12px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Yes, Delete
                    </button>
                    <button 
                        onClick={() => toast.dismiss(t.id)}
                        style={{ padding: '8px 12px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        ), {
            duration: Infinity, // Keep toast open until action is taken
            style: { background: '#fff', border: '1px solid #fca5a5' }
        });
    };

    const performDeletion = async (id) => {
        try {
            const productToDelete = products.find(p => p.id === id);

            await api.delete(`/api/supplier-files/items/${id}`);
            
            // Success toast uses the beautiful toast utility
            toast.success(`Product '${productToDelete?.name || id}' deleted successfully!`);
            
            fetchProducts(currentPage); 
        } catch (err) {
            console.error("Delete error:", err);
            const errorMsg = err.response?.data?.message || "Failed to delete product";
            toast.error(errorMsg); // Error toast uses the beautiful toast utility
        }
    };


    // --- HANDLERS (Unchanged functionality) ---
    const handleCategoryFilterChange = (value) => {
        setCategoryFilter(value);
        setCurrentPage(1);
    };
    
    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setCurrentPage(1);
    };
    
    const handlePageChange = (page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };
    

    const handleFileUpload = async (e) => {
        e.preventDefault();
        
        if (!uploadFile) {
            notify("Please select a file", 'error');
            return;
        }

        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        
        if (!validTypes.includes(uploadFile.type)) {
            notify("Please upload a valid Excel file (.xlsx or .xls)", 'error');
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('file', uploadFile);

            const res = await api.post(`/api/supplier-files/uploads`, formData);

            notify(res.data.message || "File uploaded successfully", 'success');
            
            if (res.data.warnings && res.data.warnings.length > 0) {
                setTimeout(() => {
                    res.data.warnings.forEach(warning => {
                        notify(warning, 'warning');
                    });
                }, 1000);
            }

            setShowUploadModal(false);
            setUploadFile(null);
            setCurrentPage(1);
            fetchProducts(1);
        } catch (err) {
            console.error("Upload error:", err);
            const errorMsg = err.response?.data?.message || "Failed to upload file";
            notify(errorMsg, 'error');
        } finally {
            setUploading(false);
        }
    };

    const getStockStatus = (stock) => {
        if (stock === 0) return 'stock-out'; // Only 'out of stock' status remains
        return ''; // No class for other states
    };

    const sortedProducts = useMemo(() => {
        const productsToSort = [...products];
        const getSortTimestamp = (item) => {
            const raw = item.dateUpdated || item.datePosted;
            if (!raw) return 0;
            const parsed = dayjs(raw);
            return parsed.isValid() ? parsed.valueOf() : 0;
        };

        return productsToSort.sort((a, b) => {
            const dateA = getSortTimestamp(a);
            const dateB = getSortTimestamp(b);
            if (sortBy === "recent") return dateB - dateA;
            if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
            if (sortBy === "price") return (a.price || 0) - (b.price || 0);
            return 0;
        });
    }, [products, sortBy]);

    const renderPaginationButtons = () => {
        const pages = [];
        const maxButtons = 7; 
        
        let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);

        if (endPage - startPage + 1 < maxButtons) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        if (totalPages === 0) return null;
        
        if (startPage > 1) {
            pages.push(<button key={1} onClick={() => handlePageChange(1)}>1</button>);
            if (startPage > 2) {
                pages.push(<span key="dots-start" className="pagination-dots">...</span>);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(
                <button 
                    key={i} 
                    onClick={() => handlePageChange(i)}
                    className={i === currentPage ? 'active' : ''}
                >
                    {i}
                </button>
            );
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                pages.push(<span key="dots-end" className="pagination-dots">...</span>);
            }
            pages.push(<button key={totalPages} onClick={() => handlePageChange(totalPages)}>{totalPages}</button>);
        }

        return pages;
    };


    // --- RENDER START ---
    if (loading && products.length === 0) {
        return (
            <div className="supplier-market">
                <div className="loading-container"><div className="loading-spinner"></div><p>Loading products...</p></div>
            </div>
        );
    }

    if (error && products.length === 0) {
        return (
            <div className="supplier-market">
                <div className="error-container">
                    <p className="error-message">{error}</p>
                    <button onClick={() => fetchProducts(1)} className="retry-btn">Try Again</button>
                </div>
            </div>
        );
    }

    return (
        <div className="supplier-market">
            {/* ----------- Page Header ----------- */}
            <div className="market-header">
                <div>
                    <h2>Supplier Product Management</h2>
                    <p>Manage your product listings, pricing, and categories.</p>
                </div>
            </div>

            {/* ----------- Action Buttons ----------- */}
            <div className="market-actions">
                <button className="upload-btn" onClick={() => setShowUploadModal(true)}>
                    Upload Excel File
                </button>
                <button
                    className="upload-btn"
                    onClick={() => setShowAddModal(true)}
                    style={{ marginLeft: '10px' }}
                >
                    Add New Product
                </button>
            </div>


            {/* ----------- Filter Controls & Pagination ----------- */}
            <div className="market-controls">
                <input
                    type="text"
                    placeholder="Search products..."
                    className="search-bar"
                    value={search}
                    onChange={handleSearchChange}
                />

                <select
                    className="search-bar"
                    style={{flex: '0 0 200px'}}
                    value={categoryFilter}
                    onChange={(e) => handleCategoryFilterChange(e.target.value)}
                >
                    <option value="">All Categories</option>
                    <option value="none">Missing Categories (N/A)</option> 
                    {categories.map((c) => (
                        <option key={c.CategoryID} value={c.CategoryID}>
                            {c.CategoryName}
                        </option>
                    ))}
                </select>

                <select 
                    className="search-bar"
                    style={{flex: '0 0 200px'}}
                    value={sortBy} 
                    onChange={(e) => setSortBy(e.target.value)}
                >
                    <option value="recent">Most Recent</option>
                    <option value="name">Name (A-Z)</option>
                    <option value="price">Price (Low to High)</option>
                </select>
            </div>
            
            {/* Combined Pagination Control Bar */}
            <div className="pagination-bar">
                <span className="pagination-summary">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems} items
                </span>
                
                <div className="pagination-buttons">
                    <button 
                        onClick={() => handlePageChange(currentPage - 1)} 
                        disabled={currentPage === 1 || loading}
                    >
                        &laquo;
                    </button>
                    
                    {renderPaginationButtons()}
                    
                    <button 
                        onClick={() => handlePageChange(currentPage + 1)} 
                        disabled={currentPage >= totalPages || loading}
                    >
                        &raquo;
                    </button>
                </div>
            </div>
            
            {/* ----------- Product Grid ----------- */}
            {sortedProducts.length === 0 && !loading ? (
                <div className="no-results-card">
                    <h3>No Products Found</h3>
                    <p>
                        Try adjusting your filters, search term, or pagination.
                    </p>
                </div>
            ) : (
                <div className="product-grid-container">
                    {sortedProducts.map((product) => {
                        const effectiveSummary = getEffectiveSummary(product);
                        const cardClasses = [
                            'product-card',
                            effectiveSummary?.isExpired ? 'product-card-expired' : ''
                        ].filter(Boolean).join(' ');

                        return (
                        <div className={cardClasses} key={product.id}>
                            {/* Card Header */}
                            <div className="card-header">
                                <h3>{product.name || "Unnamed Product"}</h3>
                                <div className="card-actions">
                                    <button 
                                        className="dropdown-toggle" 
                                        style={{padding: '6px 12px', fontSize: '0.9rem'}}
                                        onClick={() => setEditProduct(product)}
                                        aria-label={`Edit ${product.name}`}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        className="dropdown-toggle"
                                        style={{padding: '6px 12px', fontSize: '0.9rem', background: '#ef4444'}}
                                        onClick={() => handleDelete(product.id, product.name)} // Pass name for confirmation
                                        aria-label={`Delete ${product.name}`}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>

                            {/* Card Body */}
                            <div className="card-body">
                                {effectiveSummary?.isExpired && (
                                    <div className="expired-banner">
                                        WARNING: This listing is past its effective date. Please update or remove it.
                                    </div>
                                )}
                                {/* Description */}
                                <div className="card-description">
                                    {product.description || "No description available"}
                                </div>

                                {/* Product Details Grid */}
                                <div className="card-details-grid">
                                    <div className="detail-item">
                                        <span className="detail-label">Price:</span>
                                        <span className="detail-value">₱{parseFloat(product.price || 0).toFixed(2)}</span>
                                    </div>

                                    <div className="detail-item">
                                        <span className="detail-label">Stock:</span>
                                        <span className="detail-value">
                                            {product.stock || 0} {product.unit || "units"}
                                            <span className={`stock-badge ${getStockStatus(product.stock)}`}>
                                                {product.stock === 0 ? 'Out' : ''}
                                            </span>
                                        </span>
                                    </div>

                                    <div className="detail-item">
                                        <span className="detail-label">Unit:</span>
                                        <span className="detail-value">{product.unit || "N/A"}</span>
                                    </div>

                                    <div className="detail-item">
                                        <span className="detail-label">Updated:</span>
                                        <span className="detail-value">{formatDate(product.dateUpdated || product.datePosted || product.date)}</span>
                                    </div>

                                    {product.location && (
                                        <div className="detail-item">
                                            <span className="detail-label">Location:</span>
                                            <span className="detail-value">{product.location}</span>
                                        </div>
                                    )}

                                    {effectiveSummary && (
                                        <div className="detail-item effective-until">
                                            <span className="detail-label">Effective:</span>
                                            <div className="effective-meta">
                                                <span className={`effective-badge ${effectiveSummary.badgeClass}`}>{effectiveSummary.badgeLabel}</span>
                                                <span className="effective-text">{effectiveSummary.statusMessage}</span>
                                                {effectiveSummary.totalWindow !== null && (
                                                    <span className="effective-text subtle">
                                                        Valid window from last update: {effectiveSummary.totalWindow} day{effectiveSummary.totalWindow === 1 ? '' : 's'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Categories */}
                                <div className="card-categories">
                                    <strong style={{fontSize: '0.85rem', color: '#666'}}>Categories:</strong>
                                    {product.categoryNames && product.categoryNames !== 'N/A' ? (
                                        <div className="tags-container">
                                            {product.categoryNames.split(",").map((cat, i) => (
                                                <span key={i} className="dropdown-toggle" style={{
                                                    padding: '4px 10px',
                                                    fontSize: '0.75rem',
                                                    background: '#dcfce7',
                                                    color: '#166534'
                                                }}>
                                                    {cat.trim()}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="category-tag-na">None Assigned</span>
                                    )}
                                </div>
                            </div>

                            {/* Card Footer */}
                            <div className="card-footer">
                                Posted: {formatDate(product.datePosted || product.date || product.dateUpdated)}
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}
            
            {/* Repeat Pagination at the bottom for better UX */}
            <div className="pagination-bar bottom">
                <span className="pagination-summary">
                    Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, totalItems)} of {totalItems} items
                </span>
                
                <div className="pagination-buttons">
                    <button 
                        onClick={() => handlePageChange(currentPage - 1)} 
                        disabled={currentPage === 1 || loading}
                    >
                        &lt; Previous
                    </button>
                    
                    {renderPaginationButtons()}
                    
                    <button 
                        onClick={() => handlePageChange(currentPage + 1)} 
                        disabled={currentPage >= totalPages || loading}
                    >
                        Next &gt;
                    </button>
                </div>
            </div>

            {/* ----------- Upload Modal ----------- */}
            {showUploadModal && (
                <div className="modal-overlay" onClick={() => !uploading && setShowUploadModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Upload Products from Excel</h2>
                            <button 
                                className="close-btn" 
                                onClick={() => setShowUploadModal(false)}
                                disabled={uploading}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleFileUpload} className="upload-form">
                            <div className="upload-instructions">
                                <div className="instruction-section">
                                    <h4>📊 Required Columns:</h4>
                                    <ul>
                                        <li><strong>Name</strong> - Product name (text)</li>
                                        <li><strong>Price</strong> - Product price (number)</li>
                                        <li><strong>Unit</strong> - Unit of measure (text, e.g., kg, pcs)</li>
                                    </ul>
                                </div>
                                <div className="instruction-section">
                                    <h4>📝 Optional Columns:</h4>
                                    <ul>
                                        <li><strong>Category</strong> - Product category (text, <strong>comma-separated</strong> for multiple)</li>
                                        <li><strong>Stock</strong> - Available quantity (number)</li>
                                        <li><strong>Effective Until</strong> - Expiration date (use YYYY-MM-DD, e.g., 2025-12-05)</li>
                                    </ul>
                                </div>
                                
                                {/* DISPLAY AVAILABLE CATEGORIES DYNAMICALLY */}
                                <div className="instruction-warning instruction-categories-list">
                                    <h4>✅ Currently Available Categories:</h4>
                                    {Object.keys(groupedCategories).length > 0 ? (
                                        Object.keys(groupedCategories).map((group, index) => (
                                            <div key={index} className="category-group">
                                                <h5>{index + 1}. {group.toUpperCase().replace(/_/g, ' ')}</h5>
                                                <ul className="category-list-grid">
                                                    {groupedCategories[group].map((cat, catIndex) => (
                                                        <li key={catIndex}>{cat}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))
                                    ) : (
                                        <p>Loading or no categories assigned yet.</p>
                                    )}
                                    <p className="category-match-note">
                                        <strong>NOTE:</strong> The Category column in your Excel file <strong>MUST</strong> match the names listed above exactly, or the category assignment will be skipped.
                                    </p>
                                </div>
                                
                                <div className="instruction-example">
                                    <h4>✅ Example Excel Format:</h4>
                                    <table className="example-table">
                                        <thead>
                                            <tr>
                                                <th>Name</th><th>Description</th><th>Price</th><th>Stock</th><th>Unit</th><th>Location</th><th>Category</th><th>Effective Until</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr><td>Steel Bars</td><td>High-grade steel</td><td>1500.00</td><td>100</td><td>kg</td><td>Warehouse A</td><td>Construction, Metal</td><td>2025-12-05</td></tr>
                                            <tr><td>Office Chair</td><td>Ergonomic design</td><td>3500.00</td><td>50</td><td>pcs</td><td>Showroom</td><td>Office Supplies & Devices</td><td>2025-08-31</td></tr>
                                            <tr><td>Cement Bags</td><td>Portland cement</td><td>250.00</td><td>500</td><td>bag</td><td>Warehouse B</td><td>Construction</td><td>2026-03-15</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                
                            </div>

                            <div className="file-input-wrapper">
                                <input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={(e) => setUploadFile(e.target.files[0])}
                                    disabled={uploading}
                                    className="file-input"
                                />
                                {uploadFile && (
                                    <p className="file-selected">Selected: {uploadFile.name}</p>
                                )}
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="cancel-btn" onClick={() => setShowUploadModal(false)} disabled={uploading}>
                                    Cancel
                                </button>
                                <button type="submit" className="submit-btn" disabled={uploading || !uploadFile}>
                                    {uploading ? "Uploading..." : "Upload"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ----------- Add/Edit Product Modal ----------- */}
            {showAddModal && <AddProductForm onClose={() => setShowAddModal(false)} onCreated={() => fetchProducts(1)} />}
            {editProduct && <AddProductForm editing={editProduct} onClose={() => setEditProduct(null)} onCreated={() => fetchProducts(currentPage)} />}
        </div>
    );
};

export default SupplierMarket;