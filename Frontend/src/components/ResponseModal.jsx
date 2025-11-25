import React from "react";
import axios from "axios";
import { useAuth } from "./AuthContext";
import "./ResponseModal.css";

const ResponseModal = ({ announcement, responses, onClose, isLoading }) => {
  const { token } = useAuth(); // token must be here

  const downloadAllQuotations = async () => {
    if (!token) {
      alert("You are not authorized.");
      return;
    }

    try {
      const res = await axios.get(
        `http://localhost:3001/api/admin/announcements/${announcement.id}/download-all`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob", // important for ZIP/binary files
        }
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Quotations_${announcement.id}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to download quotations.");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          ✖
        </button>

        <h3>Responses for: {announcement.title}</h3>
        <p>{announcement.description}</p>

        {/* Download All Quotations */}
        <button
          className="abstract-btn"
          onClick={downloadAllQuotations}
          style={{ marginBottom: "15px" }}
        >
          📦 Download All Quotations (ZIP)
        </button>

        <div className="response-list">
          {isLoading ? (
            <p>Loading responses...</p>
          ) : responses.length === 0 ? (
            <p>No suppliers have responded yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Date Responded</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((res, index) => (
                  <tr key={index}>
                    <td>{res.companyName}</td>
                    <td>{new Date(res.dateUploaded).toLocaleDateString()}</td>
                    <td>
                      <a
                        href={`http://localhost:3001/${res.responseFilePath.replace(
                          /\\/g,
                          "/"
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="download-btn"
                      >
                        View Quotation
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResponseModal;
