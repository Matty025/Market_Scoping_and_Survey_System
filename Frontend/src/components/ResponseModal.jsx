import React from "react";
import "./ResponseModal.css";

const ResponseModal = ({ announcement, responses, onClose, isLoading }) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" onClick={onClose}>
          ✖
        </button>
        <h3>Responses for: {announcement.title}</h3>
        <p>{announcement.description}</p>

        <div className="response-list">
          {isLoading ? (
            <p>Loading responses...</p>
          ) : responses.length === 0 ? (
            <p>No suppliers have responded to this announcement yet.</p>
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
                        href={`http://localhost:3001/${res.responseFilePath.replace(/\\/g, '/')}`}
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