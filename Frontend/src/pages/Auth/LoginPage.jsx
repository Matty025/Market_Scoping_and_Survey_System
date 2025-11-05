import React from "react";
import LoginCard from "../../components/LoginCard";
import "./Login.css";

export default function LoginPage() {
  return (
    <div className="login-container">
      {/* Left Section with Background Image */}
      <div className="left-section">
        <h1>Welcome to Market Research Scoping & Survey System</h1>
        <h3>
          Efficiently analyze supplier trends and pricing for better procurement
          decisions.
        </h3>
      </div>

      {/* Right Section with LoginCard */}
      <div className="right-section">
        <LoginCard />
      </div>
    </div>
  );
}
