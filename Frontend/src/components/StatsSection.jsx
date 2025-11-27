import React, { useState, useEffect } from "react";
import "./StatsSection.css";

const StatsSection = ({ stats }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Trigger fade-in animation on mount
    setIsLoaded(true);
  }, []);

  return (
    <div className={`stats-container ${isLoaded ? "loaded" : ""}`}>
      {stats.map((stat, index) => (
        <div
          key={index}
          className={`stat-card1 ${stat.label.includes("Pending") ? "pulse" : ""}`}
          role="button"
          tabIndex={0}
          aria-label={`${stat.label}: ${stat.value}`}
          title={`${stat.label}: ${stat.value}`}
        >
          {/* Icon */}
          <div className="stat-icon">
            {React.cloneElement(stat.icon, { size: 24, color: "#ffffff" })}
          </div>

          {/* Info */}
          <div className="stat-info1">
            <h5 className="stat-card-label">{stat.label}</h5>
            <p className={`stat-card-value ${typeof stat.value === "number" ? "numeric" : ""}`}>
              {stat.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsSection;
