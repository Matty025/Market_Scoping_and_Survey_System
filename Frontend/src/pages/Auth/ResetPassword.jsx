import React, { useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../api";
import Toast from "../../components/Toast";
import msssLogo from "../../assets/MSSSlogo.png";
import "./ForgotReset.css";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });

  const showToast = (type, message, duration = 3200) => setToast({ visible: true, type, message, duration });
  const hideToast = () => setToast({ visible: false, type: "info", message: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      showToast("error", "Reset link is missing or invalid.");
      return;
    }
    if (password.length < 8) {
      showToast("error", "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      showToast("error", "Passwords do not match.");
      return;
    }

    setSubmitting(true);
    hideToast();

    try {
      await api.post("/auth/reset", { token, password, confirmPassword });
      showToast("success", "Password updated. Redirecting to login...");
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      console.error("[ResetPassword]", err?.response?.data || err);
      const message = err?.response?.data?.message || "Unable to reset password.";
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
        <h1 className="auth-reset-title">Reset Password</h1>
        <p className="auth-reset-subtitle">
          Choose a new password for your account.
        </p>

        <form className="auth-reset-form" onSubmit={handleSubmit}>
          <label htmlFor="new-password">New Password</label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
            required
          />

          <label htmlFor="confirm-password">Confirm Password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            required
          />

          <div className="auth-reset-actions">
            <button type="submit" className="auth-reset-submit" disabled={submitting}>
              {submitting ? "Updating..." : "Update Password"}
            </button>
            <button type="button" className="auth-reset-secondary" onClick={() => navigate("/")}>
              Back to Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
