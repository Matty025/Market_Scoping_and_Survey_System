import React from "react";
import "./StatsSection.css";

const StatsSection = ({ stats }) => {
  return (
    <div className="stats-container">
      {stats.map((stat, index) => (
        <div key={index} className="stat-card">
          <h4>{stat.label}</h4>
          <p className={`stat-value ${typeof stat.value === "number" ? "numeric" : ""}`}>
            {stat.value}
          </p>
        </div>
      ))}
    </div>
  );
};

export default StatsSection;
