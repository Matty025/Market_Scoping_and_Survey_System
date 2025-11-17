import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FaEnvelope, FaLock } from "react-icons/fa";
import { useAuth } from "./AuthContext"; // Import context
import "./LoginCard.css";
import Toast from "./Toast";

export default function LoginCard() {
  const navigate = useNavigate();
  const { login } = useAuth(); // Use context
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [toast, setToast] = useState({ visible: false, type: "info", message: "" });
  const showToast = (type, message, duration = 3000) => setToast({ visible: true, type, message, duration });
  const hideToast = () => setToast({ visible: false, type: "info", message: "" });

  // Prefill remembered email and reset fields on mount
  useEffect(() => {
    console.log("[LoginCard] Mounted. Resetting fields.");
    setEmail("");
    setPassword("");
    setErrorMsg("");
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRemember(true);
      console.log("[LoginCard] Prefilled remembered email:", rememberedEmail);
    }
  }, []);

  // Login request
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setIsLoggingIn(true);
    console.log("[LoginCard] Attempting login with:", email);

    try {
      const payload = { email: email.trim(), password };

      const res = await axios.post("http://localhost:3001/auth/login", payload);
      const { token, user } = res.data;
      const userRoleLower = user.role.toLowerCase();

      console.log("[LoginCard] Login successful. Backend role:", userRoleLower);
      showToast("success", "Login successful.");

      // Save remembered email if checked
      if (remember) localStorage.setItem("rememberedEmail", email);
      else localStorage.removeItem("rememberedEmail");

      // Update global auth context (triggers instant re-render/navigation)
      login({ token, user });

      // Explicitly navigate to the dashboard based on backend role
      if (userRoleLower === "admin") navigate("/admin/dashboard");
      else if (userRoleLower === "supplier") navigate("/supplier/dashboard");
      else if (userRoleLower === "buyer") navigate("/buyer/dashboard");
      else {
        setErrorMsg("❌ Unknown role.");
        return;
      }

      console.log("[LoginCard] Navigation triggered to:", `/${userRoleLower}/dashboard`);
    } catch (err) {
      console.error("[LoginCard] Login error:", err.response?.data || err);
      const msg = err.response?.data?.message || "Invalid email or password.";
      setErrorMsg(msg);
      showToast("error", msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Debug logout (clears context and navigates)
  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      console.log("[LoginCard] Logging out. Clearing auth context.");
      login({ token: "", user: { role: "", fullName: "", userID: "" } });
      navigate("/");
    }
  };

  return (
    <div className="login-card">
      <Toast type={toast.type} message={toast.message} visible={toast.visible} onClose={hideToast} />
      <h1 className="login-title">Login</h1> {/* Simplified title */}

      {errorMsg && <p className="error-message">{errorMsg}</p>}

      {/* Login Form */}
      <form onSubmit={handleLogin}>
        <div className="input-icon">
          <FaEnvelope />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="input-icon">
          <FaLock />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
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
          {isLoggingIn ? "Logging in..." : "Login"}
        </button>
      </form>

      <p className="register-link">
        Don’t have an account?{" "}
        <button onClick={() => navigate("/register")}>Register</button>
      </p>

      {/* Debug Logout Button */}
      <button
        style={{ marginTop: "10px", fontSize: "0.8rem" }}
        onClick={handleLogout}
      >
        Logout (Debug)
      </button>
    </div>
  );
}