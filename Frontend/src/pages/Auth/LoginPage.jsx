import React from "react";
import LoginCard from "../../components/LoginCard";
import "./Login.css";

export default function LoginPage() {
  return (
    <div className="login-container">
      {/* Left Section with Background Image */}
      <div className="left-section">
        <h1>Market Scoping & Survey System</h1>
        <h3>
          Analyze market data, track supplier pricing, and make smarter procurement decisions.
        </h3>
      </div>

      {/* Right Section with LoginCard */}
      <div className="right-section">
        <LoginCard />
      </div>
    </div>
  );
}
