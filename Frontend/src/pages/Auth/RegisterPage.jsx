import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./RegisterPage.css";
import Toast from "../../components/Toast";

// Unified Register Page for Supplier and Buyer
// - Posts to /auth/register with role in the body
// - Uses env-based API URL (VITE_API_URL)
// - Validates fields and prevents double submit

const initialFormData = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  // Supplier-only fields
  companyName: "",
  address: "",
  contactNumber: "",
    hasPhilgeps: false,
  hasSecRegistration: false,
  hasBusinessPermit: false,
  hasTaxClearance: false,
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("supplier"); // 'supplier' | 'buyer'
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });

  const showToast = (type, message, duration = 3000) => {
    setToast({ visible: true, type, message, duration });
  };
  const hideToast = () => setToast({ visible: false, type: "info", message: "" });

  const API_BASE = useMemo(() => {
    return import.meta.env.VITE_API_URL || "http://localhost:3001";
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const validate = () => {
    const email = formData.email.trim();
    const password = formData.password;
    const confirmPassword = formData.confirmPassword;

    if (!formData.fullName.trim()) return "Full name is required.";
    if (!email) return "Email is required.";
    // Basic email format check
    const emailOk = /.+@.+\..+/.test(email);
    if (!emailOk) return "Enter a valid email address.";

    if (!password) return "Password is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";

    if (role === "supplier") {
      if (!formData.companyName.trim()) return "Company name is required for suppliers.";
      if (!formData.address.trim()) return "Address is required for suppliers.";
      if (!formData.contactNumber.trim()) return "Contact number is required for suppliers.";
          }

    return "";
  };

  const resetForm = () => {
    setFormData(initialFormData);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    const validationError = validate();
    if (validationError) {
      setErrorMsg(validationError);
      showToast("error", validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const payloadBase = {
        role: role.toLowerCase(),
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
      };

      let payload = payloadBase;

      if (role === "supplier") {
        payload = {
          ...payloadBase,
          companyName: formData.companyName.trim(),
          address: formData.address.trim(),
          contactNumber: formData.contactNumber.trim(),
                    hasPhilgeps: !!formData.hasPhilgeps,
          hasSecRegistration: !!formData.hasSecRegistration,
          hasBusinessPermit: !!formData.hasBusinessPermit,
          hasTaxClearance: !!formData.hasTaxClearance,
        };
      }

      const url = `${API_BASE}/auth/register`;
      const res = await axios.post(url, payload);

      const message = res.data?.message || `${role === "supplier" ? "Supplier" : "Buyer"} registered successfully.`;
      setSuccessMsg(message);
      showToast("success", message);

      // Optional: direct to login after short delay
      resetForm();
      setTimeout(() => navigate("/"), 800);
    } catch (err) {
      let msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.msg ||
        "Registration failed. Please try again.";
      if (err?.response?.status === 409) {
        msg = "Email already in use. Try logging in or use another email.";
      }
      setErrorMsg(msg);
      showToast("error", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="register-card">
      <Toast type={toast.type} message={toast.message} visible={toast.visible} onClose={hideToast} />
      <h1 className="register-title">{role === "supplier" ? "Supplier" : "Buyer"} Registration</h1>

      {/* Role toggle */}
      <div className="role-toggle">
        {[
          { key: "supplier", label: "Supplier" },
          { key: "buyer", label: "Buyer" },
        ].map((r) => (
          <button
            key={r.key}
            className={role === r.key ? "active" : ""}
            onClick={() => setRole(r.key)}
            type="button"
          >
            {r.label}
          </button>
        ))}
      </div>

      {errorMsg && <p className="error-message">{errorMsg}</p>}
      {successMsg && <p className="success-message">{successMsg}</p>}

      <form onSubmit={handleRegister}>
        <div className="input-group">
          <input
            type="text"
            name="fullName"
            placeholder={role === "supplier" ? "Contact Person Full Name" : "Full Name"}
            value={formData.fullName}
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

          {role === "supplier" && (
            <>
              <input
                type="text"
                name="companyName"
                placeholder="Company Name"
                value={formData.companyName}
                onChange={handleChange}
                required
              />
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
                          </>
          )}
        </div>

        {role === "supplier" && (
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
                  name="hasSecRegistration"
                  checked={formData.hasSecRegistration}
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
              Physical copies of these documents must be sent to DepEd@gmail.com for verification.
            </p>
          </div>
        )}

        <button type="submit" className="register-btn" disabled={isSubmitting}>
          {isSubmitting ? "Registering..." : "Register"}
        </button>
      </form>

      <p className="login-link">
        Already have an account? <button type="button" onClick={() => navigate("/")}>Login</button>
      </p>
    </div>
  );
}
