import React, { useState } from "react";
import "./MarketSuppliers.css";

const MarketSuppliers = () => {
  // ✅ Sample supplier data (replace with backend data later)
  const [suppliers] = useState([
    {
      id: 1,
      name: "TechZone Solutions",
      email: "contact@techzone.com",
      category: "Electronics",
      location: "Quezon City",
      totalProducts: 24,
      status: "Active",
      dateJoined: "2024-06-15",
    },
    {
      id: 2,
      name: "OfficePro Supplies",
      email: "sales@officepro.com",
      category: "Office Equipment",
      location: "Makati City",
      totalProducts: 15,
      status: "Inactive",
      dateJoined: "2024-02-20",
    },
    {
      id: 3,
      name: "EduPrint Co.",
      email: "info@eduprint.com",
      category: "School Supplies",
      location: "Baliuag, Bulacan",
      totalProducts: 37,
      status: "Active",
      dateJoined: "2024-09-02",
    },
    {
      id: 4,
      name: "FurniSmart",
      email: "furnismart@gmail.com",
      category: "Furniture",
      location: "Pasig City",
      totalProducts: 12,
      status: "Active",
      dateJoined: "2024-03-11",
    },
  ]);

  const [search, setSearch] = useState("");

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase()) ||
      s.location.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="market-suppliers-container">
      {/* Header */}
      <header className="market-suppliers-header">
        <h2>🏢 Supplier Directory</h2>
        <p>View all registered suppliers participating in the market.</p>
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
              <th>Status</th>
              <th>Date Joined</th>
            </tr>
          </thead>
          <tbody>
            {filteredSuppliers.length > 0 ? (
              filteredSuppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.email}</td>
                  <td>{supplier.category}</td>
                  <td>{supplier.location}</td>
                  <td>{supplier.totalProducts}</td>
                  <td>
                    <span
                      className={`status-badge ${supplier.status.toLowerCase()}`}
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
                <td colSpan="7" className="no-results">
                  No suppliers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketSuppliers;
