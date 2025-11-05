import React from "react";
import "./Footer.css";

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        <p className="footer-text">
          © {new Date().getFullYear()} Market Research Scoping and Survey System
        </p>
        <p className="footer-subtext">
          Developed by <strong>Team MRSSS</strong> | All Rights Reserved
        </p>
      </div>
    </footer>
  );
};

export default Footer;
