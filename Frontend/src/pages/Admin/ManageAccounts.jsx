import React, { useState } from "react";
import "./ManageAccounts.css";

const ManageAccounts = () => {
  // Sample supplier data
  const [suppliers, setSuppliers] = useState([
    { id: 1, name: "ABC Supplies", status: "pending" },
    { id: 2, name: "Tech Solutions", status: "active" },
    { id: 3, name: "Office World", status: "blacklisted" },
    { id: 4, name: "Lab Equip Co.", status: "pending" }
  ]);

  const handleApprove = (id) => {
    setSuppliers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "active" } : s))
    );
  };

  const handleReject = (id) => {
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleBlacklist = (id) => {
    setSuppliers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "blacklisted" } : s))
    );
  };

  return (
    <div className="manage-accounts-container">
      <h2>👥 Manage Accounts</h2>
      <p>Here you can view and manage supplier accounts.</p>

      {/* Supplier Table */}
      <table className="supplier-table">
        <thead>
          <tr>
            <th>Supplier Name</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((supplier) => (
            <tr key={supplier.id}>
              <td>{supplier.name}</td>
              <td>
                <span className={`status ${supplier.status}`}>
                  {supplier.status.toUpperCase()}
                </span>
              </td>
              <td className="actions-cell">
                {supplier.status === "pending" && (
                  <>
                    <button onClick={() => handleApprove(supplier.id)} className="approve-btn">Approve</button>
                    <button onClick={() => handleReject(supplier.id)} className="reject-btn">Reject</button>
                  </>
                )}
                {supplier.status === "active" && (
                  <button onClick={() => handleBlacklist(supplier.id)} className="blacklist-btn">Blacklist</button>
                )}
                {supplier.status === "blacklisted" && (
                  <button onClick={() => handleApprove(supplier.id)} className="approve-btn">Reinstate</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ManageAccounts;
