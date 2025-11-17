import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./RegisterPage.css";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("Supplier");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    address: "",
    contactNumber: "",
    sdoLocation: "",
    hasPhilgeps: false,
    hasSECRegistration: false,
    hasBusinessPermit: false,
    hasTaxClearance: false,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const {
      name,
      email,
      password,
      confirmPassword,
      address,
      contactNumber,
      sdoLocation,
      hasPhilgeps,
      hasSECRegistration,
      hasBusinessPermit,
      hasTaxClearance,
    } = formData;

    if (!name || !email || !password || !confirmPassword) {
      alert("Please fill in all required fields.");
      return;
    }

    if (password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    try {
      let apiUrl = "";
      let payload = {};

      if (role === "Supplier") {
        apiUrl = "http://localhost:3001/suppliers/register"; // ensure route matches backend
        payload = {
          FullName: name,
          Email: email,
          Password: password,
          CompanyName: name,
          Address: address,
          ContactNumber: contactNumber,
          SDOLocation: sdoLocation,
          HasPhilgeps: hasPhilgeps,
          HasSECRegistration: hasSECRegistration,
          HasBusinessPermit: hasBusinessPermit,
          HasTaxClearance: hasTaxClearance,
        };
      } else if (role === "Buyer") {
        apiUrl = "http://localhost:3001/buyer/register"; // add buyer route backend
        payload = {
          FullName: name,
          Email: email,
          Password: password,
        };
      }

      console.log("Submitting registration:", payload);
      const res = await axios.post(apiUrl, payload);
      console.log("Response:", res.data);

      alert(res.data.message || `${role} registration successful!`);

      // Reset form after successful registration
      setFormData({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        address: "",
        contactNumber: "",
        sdoLocation: "",
        hasPhilgeps: false,
        hasSECRegistration: false,
        hasBusinessPermit: false,
        hasTaxClearance: false,
      });

      navigate("/"); // back to login
    } catch (err) {
      console.error("Registration error:", err);
      alert(err.response?.data?.error || "Registration failed. Try again.");
    }
  };

  return (
    <div className="register-card">
      <h1 className="register-title">{role} Registration</h1>

      {/* Role toggle */}
      <div className="role-toggle">
        {["Supplier", "Buyer"].map((r) => (
          <button
            key={r}
            className={role === r ? "active" : ""}
            onClick={() => setRole(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <form onSubmit={handleRegister}>
        <div className="input-group">
          <input
            type="text"
            name="name"
            placeholder={role === "Supplier" ? "Business Name" : "Full Name"}
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
          {role === "Supplier" && (
            <>
              <input
                type="text"
                name="address"
                placeholder="Address"
                value={formData.address}
                onChange={handleChange}
                required
              />
              <input
                type="text"
                name="contactNumber"
                placeholder="Contact Number"
                value={formData.contactNumber}
                onChange={handleChange}
                required
              />
              <input
                type="text"
                name="sdoLocation"
                placeholder="Branch Location"
                value={formData.sdoLocation}
                onChange={handleChange}
                required
              />
            </>
          )}
        </div>

        {/* Supplier documents */}
        {role === "Supplier" && (
          <div className="document-section">
            <h3>Required Documents / Registrations</h3>
            <div className="checkboxes">
              <label>
                <input
                  type="checkbox"
                  name="hasPhilgeps"
                  checked={formData.hasPhilgeps}
                  onChange={handleChange}
                />
                PhilGEPS Registration
              </label>
              <label>
                <input
                  type="checkbox"
                  name="hasSECRegistration"
                  checked={formData.hasSECRegistration}
                  onChange={handleChange}
                />
                SEC Registration
              </label>
              <label>
                <input
                  type="checkbox"
                  name="hasBusinessPermit"
                  checked={formData.hasBusinessPermit}
                  onChange={handleChange}
                />
                Business Permit
              </label>
              <label>
                <input
                  type="checkbox"
                  name="hasTaxClearance"
                  checked={formData.hasTaxClearance}
                  onChange={handleChange}
                />
                Tax Clearance
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
