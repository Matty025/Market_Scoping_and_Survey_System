import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { FaEnvelope, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import { useAuth } from "./AuthContext"; // Import context
import msssLogo from "../assets/MSSSlogo.png"; // Import the logo
import "./LoginCard.css";
import Toast from "./Toast";

export default function LoginCard() {
  const navigate = useNavigate();
  const { login } = useAuth(); // Use context
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });

  const showToast = (type, message, duration = 3000) =>
    setToast({ visible: true, type, message, duration });
  const hideToast = () => setToast({ visible: false, type: "info", message: "" });
  // Prefill remembered email and reset fields on mount
  useEffect(() => {
    setEmail("");
    setPassword("");
    setErrorMsg("");
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRemember(true);
    }
  }, []);

  // Login request
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setIsLoggingIn(true);

    try {
      const payload = { email: email.trim(), password };
      const res = await api.post("/auth/login", payload);
      const { token, user } = res.data;
      const userRoleLower = user.role.toLowerCase();

      if (!token) throw new Error("No token received from backend.");

      // ✅ STORE TOKEN in localStorage for Dashboard or API calls
      localStorage.setItem("token", token);
      // Optionally store user info
      localStorage.setItem("user", JSON.stringify(user));

      // Save remembered email if checked
      if (remember) localStorage.setItem("rememberedEmail", email);
      else localStorage.removeItem("rememberedEmail");

      // Update global auth context (in-memory)
      login({ token, user });

      showToast("success", "Login successful.");

      // Navigate to dashboard based on role
      if (userRoleLower === "admin") navigate("/admin/dashboard");
      else if (userRoleLower === "supplier") navigate("/supplier/dashboard");
      else if (userRoleLower === "buyer") navigate("/buyer/dashboard");
      else {
        setErrorMsg("❌ Unknown role.");
        return;
      }
    } catch (err) {
      console.error("[LoginCard] Login error:", err.response?.data || err);
      const msg = err.response?.data?.message || err.message || "Invalid email or password.";
      setErrorMsg(msg);
      showToast("error", msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Optional logout handler
  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      login({ token: "", user: { role: "", fullName: "", userID: "" } });
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/");
    }
  };

  return (
    <div className="login-card">
      <img src={msssLogo} alt="MSSS Logo" className="logo-image" />
      <Toast type={toast.type} message={toast.message} visible={toast.visible} onClose={hideToast} />
      <h1 className="login-title">Welcome Back</h1>

      {errorMsg && <p className="error-message">{errorMsg}</p>}

      <form onSubmit={handleLogin}>
        <div className="input-icon">
          <FaEnvelope />
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="input-icon">
          <FaLock />
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
          >
            {showPassword ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>

        <div className="login-options">
          <label className="remember-me">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember Me
          </label>
        </div>

        <button type="submit" className="login-btn" disabled={isLoggingIn}>
          {isLoggingIn ? "Signing In..." : "Sign In"}
        </button>
      </form>

      <p className="register-link">
        Don't have an account?
        <button onClick={() => navigate("/register")}>Create Account</button>
      </p>
    </div>
  );
}
