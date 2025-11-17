import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FaEnvelope, FaLock } from "react-icons/fa";
import { useAuth } from "./AuthContext"; // Import context
import "./LoginCard.css";

export default function LoginCard() {
  const navigate = useNavigate();
  const { login } = useAuth(); // Use context
  const [role, setRole] = useState("admin"); // Frontend toggle default (visual only)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [roleTransition, setRoleTransition] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Prefill remembered email and reset fields on mount
  useEffect(() => {
    console.log("[LoginCard] Mounted. Resetting fields.");
    setRole("admin");
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

  // Handle frontend role toggle (visual only; doesn't affect login)
  const handleRoleChange = (newRole) => {
    console.log(`[LoginCard] Role toggle clicked. Current role: ${role}, New role: ${newRole}`);
    if (newRole === role) return;
    setRoleTransition(true);
    setTimeout(() => {
      setRole(newRole);
      setRoleTransition(false);
      console.log("[LoginCard] Role changed to:", newRole);
    }, 200);
  };

  // Login request
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setIsLoggingIn(true);
    console.log("[LoginCard] Attempting login with:", email, "Role selected:", role);

    try {
      const payload = { email, password };
      // Optional: If you want the toggle to send selected role to backend, uncomment:
      // payload.role = role;

      const res = await axios.post("http://localhost:3001/auth/login", payload);
      const { token, user } = res.data;
      const userRoleLower = user.role.toLowerCase();

      console.log("[LoginCard] Login successful. Backend role:", userRoleLower);

      // Save remembered email if checked
      if (remember) localStorage.setItem("rememberedEmail", email);
      else localStorage.removeItem("rememberedEmail");

      // Update global auth context (triggers instant re-render/navigation)
      login({ token, user });

      // Navigation is now handled by App's routes via context
      console.log("[LoginCard] Auth context updated. Navigation will happen automatically.");
    } catch (err) {
      console.error("[LoginCard] Login error:", err.response?.data || err);
      setErrorMsg(err.response?.data?.message || "Server error. Try again.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Debug logout (clears context and navigates)
  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      console.log("[LoginCard] Logging out. Clearing auth context.");
      login({ token: "", user: { role: "", fullName: "", userID: "" } }); // Or use logout from context
      navigate("/");
    }
  };

  return (
    <div className="login-card">
      <h1 className="login-title">
        Login – {role.charAt(0).toUpperCase() + role.slice(1)}
      </h1>

      {errorMsg && <p className="error-message">{errorMsg}</p>}

      {/* Role Toggle (Visual Only) */}
      <div className={`role-toggle ${roleTransition ? "transitioning" : ""}`}>
        {["admin", "supplier", "buyer"].map((r) => (
          <button
            key={r}
            className={role === r ? "active" : ""}
            onClick={() => handleRoleChange(r)}
          >
            {r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

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

    </div>
  );
}