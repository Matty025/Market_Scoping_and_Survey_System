import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import Toast from '../../components/Toast';
import './UploadProducts.css';
import { useAuth } from '../../components/AuthContext';

const backendBase = 'http://localhost:3001';

export default function AddProductForm({ onClose, onCreated }) {
  const { token } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [location, setLocation] = useState('');
  const [categories, setCategories] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [matches, setMatches] = useState([]);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const categoryRef = useRef(null);

  useEffect(() => {
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCategories = async () => {
    try {
      // Only load supplier-assigned categories. Uploads should use those.
      const categoriesRes = await axios.get(`${backendBase}/api/supplier-files/categories`, { headers: { Authorization: `Bearer ${token}` } });
      if (Array.isArray(categoriesRes.data) && categoriesRes.data.length > 0) {
        const flat = categoriesRes.data.map((c) => ({ id: c.CategoryID, name: c.CategoryName }));
        setAllCategories(flat);
      } else {
        // No categories assigned to this supplier — show empty list and notify user
        setAllCategories([]);
        setToast({ visible: true, message: 'No categories assigned to your supplier profile. Please contact admin or update your profile.', type: 'info' });
      }
    } catch (err) {
      console.error('Failed to fetch categories', err);
      setToast({ visible: true, message: 'Failed to load categories', type: 'error' });
    }
  };

  const toggleCategory = (id) => {
    setCategories((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const filteredCategories = allCategories.filter((c) => c.name.toLowerCase().includes(categoryFilter.toLowerCase()));

  useEffect(() => {
    const onDocClick = (e) => {
      if (!categoryRef.current) return;
      if (!categoryRef.current.contains(e.target)) setCategoryOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // debounce name input and check existing items for this supplier
  useEffect(() => {
    if (!name || name.trim().length < 2) {
      setMatches([]);
      return;
    }
    const id = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await axios.get(`${backendBase}/api/supplier-files/items?q=${encodeURIComponent(name)}`, { headers: { Authorization: `Bearer ${token}` } });
        setMatches(res.data || []);
      } catch (err) {
        console.error('Match lookup failed', err);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => clearTimeout(id);
  }, [name, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return setToast({ visible: true, message: 'Not authenticated', type: 'error' });
    if (!name || !unit) return setToast({ visible: true, message: 'Name and unit required', type: 'error' });

    try {
      const payload = { name, description, price: parseFloat(price) || 0, stock: parseFloat(stock) || 0, unit, location, categories };
      const res = await axios.post(`${backendBase}/api/supplier-files/items`, payload, { headers: { Authorization: `Bearer ${token}` } });
      setToast({ visible: true, message: 'Item created', type: 'success' });
      onCreated && onCreated(res.data.itemId);
      onClose && onClose();
    } catch (err) {
      console.error('Create item failed', err);
      setToast({ visible: true, message: `Create failed: ${err.response?.data?.message || err.message}`, type: 'error' });
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="add-product-title">
      <div className="modal" role="document">
        <div className="modal-header">
          <h3 id="add-product-title">Add Product</h3>
          <button aria-label="Close" className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="add-product-form">
          <div className="form-grid">
            <div className="form-row full">
              <label htmlFor="ap-name">Name *</label>
              <input id="ap-name" className="form-input" placeholder="e.g. Cement Type 1" value={name} onChange={(e) => setName(e.target.value)} required />
              {checking ? <div className="small-muted">Checking for existing items...</div> : null}
            </div>

            {matches.length > 0 && (
              <div className="form-row full">
                <div className="small-muted">Existing items that match:</div>
                <div className="matches">
                  {matches.slice(0, 5).map((m) => (
                    <div key={m.ItemID} className="match-card">
                      <div className="match-main">
                        <div className="match-name">{m.Name}</div>
                        <div className="match-meta">{m.Unit} • ₱{m.Price}</div>
                        <div className="match-desc">{m.Description}</div>
                      </div>
                      <div className="match-actions">
                        <button type="button" className="use-btn" onClick={() => {
                          setName(m.Name);
                          setDescription(m.Description || '');
                          setPrice(m.Price || '');
                          setStock(m.Stock || '');
                          setUnit(m.Unit || 'pcs');
                          setLocation(m.Location || '');
                        }}>Use / Prefill</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="form-row full">
              <label htmlFor="ap-description">Description</label>
              <textarea id="ap-description" className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="ap-price">Price</label>
              <input id="ap-price" className="form-input" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="ap-stock">Stock</label>
              <input id="ap-stock" className="form-input" type="number" step="0.01" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>

            <div className="form-row">
              <label htmlFor="ap-unit">Unit *</label>
              <input id="ap-unit" className="form-input" value={unit} onChange={(e) => setUnit(e.target.value)} required />
            </div>

            <div className="form-row full">
              <label htmlFor="ap-location">Location</label>
              <input id="ap-location" className="form-input" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="form-row full">
              <label>Categories (choose any)</label>
              <div className="multi-select" ref={categoryRef}>
                <button type="button" className="ms-control" onClick={() => setCategoryOpen((s) => !s)} aria-haspopup="listbox" aria-expanded={categoryOpen}>
                  <div className="ms-chips">
                    {categories.length === 0 && <span className="ms-placeholder">Select categories...</span>}
                    {categories.map((id) => {
                      const item = allCategories.find((c) => c.id === id);
                      return (
                        <span key={id} className="ms-chip">{item ? item.name : id}<button type="button" className="ms-chip-remove" onClick={(e) => { e.stopPropagation(); toggleCategory(id); }} aria-label={`Remove ${item?.name || id}`}>×</button></span>
                      );
                    })}
                  </div>
                  <span className="ms-caret">▾</span>
                </button>

                {categoryOpen && (
                  <div className="ms-dropdown" role="listbox">
                    <div className="ms-search">
                      <input placeholder="Search categories..." value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} />
                    </div>
                    <div className="ms-list">
                      {filteredCategories.length === 0 ? (
                        <div className="ms-empty">No categories</div>
                      ) : (
                        filteredCategories.map((c) => (
                          <label key={c.id} className="ms-item">
                            <input type="checkbox" checked={categories.includes(c.id)} onChange={() => toggleCategory(c.id)} />
                            <span className="ms-item-name">{c.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Create</button>
          </div>
        </form>

        <Toast visible={toast.visible} type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, visible: false })} />
      </div>
    </div>
  );
}
