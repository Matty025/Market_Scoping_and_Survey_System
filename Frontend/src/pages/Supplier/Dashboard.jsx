import React, { useState } from "react";
import "./Dashboard.css";

const SupplierDashboard = () => {
  // 🗂 Sample admin posts (from Admin)
  const [posts] = useState([
    {
      id: 1,
      title: "Procurement of Laptops for Teachers",
      date: "2025-11-09",
      description:
        "DepEd is requesting quotations for high-quality laptops for classroom and online learning purposes.",
    },
    {
      id: 2,
      title: "Supply of Classroom Furniture",
      date: "2025-11-07",
      description:
        "Looking for qualified suppliers to provide durable classroom chairs and tables for public schools.",
    },
    {
      id: 3,
      title: "Printing of Learning Materials",
      date: "2025-11-05",
      description:
        "Seeking suppliers for the printing and binding of educational modules for the upcoming school year.",
    },
  ]);

  // 💬 Sample quotation requests (specific to supplier)
  const [quotationRequests] = useState([
    {
      id: 101,
      requestTitle: "Laptop Quotation Request",
      referencePost: "Procurement of Laptops for Teachers",
      dateRequested: "2025-11-10",
      status: "Pending",
    },
    {
      id: 102,
      requestTitle: "Classroom Chairs Quotation Request",
      referencePost: "Supply of Classroom Furniture",
      dateRequested: "2025-11-08",
      status: "Approved",
    },
    {
      id: 103,
      requestTitle: "Printing Quotation Request",
      referencePost: "Printing of Learning Materials",
      dateRequested: "2025-11-06",
      status: "Declined",
    },
  ]);

  // Sort posts chronologically (latest first)
  const sortedPosts = [...posts].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  return (
    <div className="supplier-dashboard">
      {/* ===== ADMIN POSTS ===== */}
      <header className="supplier-header">
        <h2>📋 Posted Market Research Projects</h2>
        <p>These are the latest procurement opportunities posted by Admin.</p>
      </header>

      <div className="posts-container">
        {sortedPosts.map((post) => (
          <div
            key={post.id}
            className="post-card"
            onClick={() => console.log(`Clicked post ID: ${post.id}`)}
          >
            <h3 className="post-title">{post.title}</h3>
            <p className="post-date">
              📅{" "}
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <p className="post-description">{post.description}</p>
          </div>
        ))}
      </div>

      <hr style={{ margin: "40px 0", border: "1px solid #e5e7eb" }} />

      {/* ===== QUOTATION REQUESTS ===== */}
      <section className="quotation-section">
        <h2>📑 Quotation Requests</h2>
        <p>These are your recent quotation requests submitted to the admin.</p>

        <div className="quotation-table-container">
          <table className="quotation-table">
            <thead>
              <tr>
                <th>Request Title</th>
                <th>Reference Project</th>
                <th>Date Requested</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {quotationRequests.map((req) => (
                <tr key={req.id}>
                  <td>{req.requestTitle}</td>
                  <td>{req.referencePost}</td>
                  <td>
                    {new Date(req.dateRequested).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </td>
                  <td>
                    <span className={`status-badge ${req.status.toLowerCase()}`}>
                      {req.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default SupplierDashboard;
