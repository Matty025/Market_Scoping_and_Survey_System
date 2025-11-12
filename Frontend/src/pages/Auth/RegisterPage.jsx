import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./RegisterPage.css";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("Supplier");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    businessPermit: false,
    birCertificate: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleRegister = (e) => {
    e.preventDefault();
    const { name, email, password, confirmPassword } = formData;

    if (!name || !email || !password || !confirmPassword) {
      alert("Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    alert(`${role} registration successful!`);
    navigate("/"); // Back to login
  };

  return (
    <div className="register-card">
      <h1 className="register-title">{role} Registrations</h1>

      {/* Role selection */}
      <div className="role-toggle">
        <button
          className={role === "Supplier" ? "active" : ""}
          onClick={() => setRole("Supplier")}
        >
          Supplier
        </button>
        <button
          className={role === "Buyer" ? "active" : ""}
          onClick={() => setRole("Buyer")}
        >
          Buyer
        </button>
      </div>

      <form onSubmit={handleRegister}>
        <div className="input-group">
          <input
            type="text"
            name="name"
            placeholder={
              role === "Supplier" ? "Business Name" : "Full Name"
            }
            value={formData.name}
            onChange={handleChange}
            required
          />
          <input
            type="email"
            name="email"
            placeholder="Email Address"
            value={formData.email}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="confirmPassword"
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={handleChange}
            required
          />
        </div>

        {/* Supplier-only section */}
        {role === "Supplier" && (
          <div className="document-section">
            <h3>Required Documents</h3>
            <div className="checkboxes">
              <label>
                <input
                  type="checkbox"
                  name="businessPermit"
                  checked={formData.businessPermit}
                  onChange={handleChange}
                />
                Business Permit
              </label>
              <label>
                <input
                  type="checkbox"
                  name="birCertificate"
                  checked={formData.birCertificate}
                  onChange={handleChange}
                />
                BIR Certificate
              </label>
            </div>
            <p className="note">
              *Physical copies of these documents must be verified by DepEd.
            </p>
          </div>
        )}

        <button type="submit" className="register-btn">
          Register
        </button>
      </form>

      <p className="login-link">
        Already have an account?{" "}
        <button onClick={() => navigate("/")}>Login</button>
      </p>
    </div>
  );
}
