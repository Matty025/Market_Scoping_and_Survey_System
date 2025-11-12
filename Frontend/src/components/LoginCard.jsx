import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaEnvelope, FaLock } from "react-icons/fa";
import "./LoginCard.css";

export default function LoginCard() {
  const navigate = useNavigate();
  const [role, setRole] = useState("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  // Prefill saved email if "Remember Me" was checked
  useEffect(() => {
    const rememberedEmail = localStorage.getItem("rememberedEmail");
    if (rememberedEmail) {
      setEmail(rememberedEmail);
      setRemember(true);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();

    if (!email || !password) {
      alert("Please fill in all fields");
      return;
    }

    // ADMIN LOGIN
    if (email === "admin@gmail.com" && password === "admin" && role === "admin") {
      sessionStorage.setItem("userRole", "admin");
      window.dispatchEvent(new Event("storage"));
      alert("✅ Login successful! Redirecting to Admin Dashboard...");
      navigate("/admin/dashboard");
    }

    // SUPPLIER LOGIN
    else if (email === "supplier@gmail.com" && password === "supplier" && role === "supplier") {
      sessionStorage.setItem("userRole", "supplier");
      window.dispatchEvent(new Event("storage"));
      alert("✅ Login successful! Redirecting to Supplier Dashboard...");
      navigate("/supplier/dashboard");
    }

    // TEACHER LOGIN
    else if (email === "buyer@gmail.com" && password === "buyer" && role === "buyer") {
      sessionStorage.setItem("userRole", "buyer");
      window.dispatchEvent(new Event("storage"));
      alert("✅ Login successful! Redirecting to Buyer Dashboard...");
      navigate("/buyer/dashboard");
    }


        // INVALID
        else {
          alert("❌ Invalid credentials or role. Try again.");
        }
      };


  return (
    <div className="login-card">
      <h1 className="login-title">
        Login - {role.charAt(0).toUpperCase() + role.slice(1)}
      </h1>

      {/* Role Toggle */}
      <div className="role-toggle">
        <button
          className={role === "admin" ? "active" : ""}
          onClick={() => setRole("admin")}
        >
          Admin
        </button>
        <button
          className={role === "supplier" ? "active" : ""}
          onClick={() => setRole("supplier")}
        >
          Supplier
        </button>
        <button
          className={role === "buyer" ? "active" : ""}
          onClick={() => setRole("buyer")}
        >
          Buyer
        </button>
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

          <button
            type="button"
            className="forgot-password"
            onClick={() => alert("Password reset coming soon!")}
          >
            Forgot Password?
          </button>
        </div>

        <button type="submit" className="login-btn">
          Login
        </button>
      </form>

      <p className="register-link">
        Don’t have an account?{" "}
        <button
          className="register-btn-login"
          onClick={() => navigate("/register")}
        >
          Register
        </button>
      </p>
    </div>
  );
}
