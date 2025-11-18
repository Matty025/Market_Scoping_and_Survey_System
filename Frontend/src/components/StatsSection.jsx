import React from "react";
import "./StatsSection.css";

const StatsSection = ({ stats }) => {
  return (
    <div className="stats-container">
      {stats.map((stat, index) => (
        <div key={index} className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: stat.bgColor }}>{stat.icon}</div>
          <div className="stat-info">
            <h4 className="stat-label">{stat.label}</h4>
            <p className="stat-value">
              {stat.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsSection;
