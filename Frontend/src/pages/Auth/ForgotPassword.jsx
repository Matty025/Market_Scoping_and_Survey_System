import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api";
import Toast from "../../components/Toast";
import msssLogo from "../../assets/MSSSlogo.png";
import "./ForgotReset.css";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });

  const showToast = (type, message, duration = 3200) => setToast({ visible: true, type, message, duration });
  const hideToast = () => setToast({ visible: false, type: "info", message: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    hideToast();

    try {
      await api.post("/auth/forgot", { email: email.trim() });
      showToast("success", "If that email exists, a reset link was sent.");
    } catch (err) {
      console.error("[ForgotPassword]", err?.response?.data || err);
      const message = err?.response?.data?.message || "Unable to process the request right now.";
      showToast("error", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-reset-page">
      <div className="auth-reset-card">
        <img src={msssLogo} alt="MSSS" className="auth-reset-logo" />
        <Toast type={toast.type} message={toast.message} visible={toast.visible} onClose={hideToast} />
        <h1 className="auth-reset-title">Forgot Password</h1>
        <p className="auth-reset-subtitle">
          Enter your account email and we'll send you a link to reset your password.
        </p>

        <form className="auth-reset-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <div className="auth-reset-actions">
            <button type="submit" className="auth-reset-submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send Reset Link"}
            </button>
            <button type="button" className="auth-reset-secondary" onClick={() => navigate("/")}>
              Back to Login
            </button>
          </div>
        </form>

        <div className="auth-reset-footer">
          Remembered your password? <button type="button" onClick={() => navigate("/")}>Go to Login</button>
        </div>
      </div>
    </div>
  );
}
