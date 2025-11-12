import React, { useState } from "react";
import "./Market.css";

const Market = () => {
  const categories = [
    "Office Supplies",
    "IT Equipment",
    "Furniture",
    "Laboratory",
    "Sports",
    "Vehicles",
    "Printing"
  ];

  const marketItems = [
    // Office Supplies
    { company: "ABC Supplies", category: "Office Supplies", product: "Laptop", updated: "Nov 01, 2025", unit: "pcs", price: 50000 },
    { company: "Office Depot", category: "Office Supplies", product: "Notebook", updated: "Nov 02, 2025", unit: "pcs", price: 150 },
    { company: "Stationery Co.", category: "Office Supplies", product: "Pen Set", updated: "Nov 03, 2025", unit: "set", price: 300 },
    { company: "Desk World", category: "Office Supplies", product: "Desk Organizer", updated: "Nov 04, 2025", unit: "pcs", price: 750 },
    { company: "Paper Hub", category: "Office Supplies", product: "A4 Paper", updated: "Nov 05, 2025", unit: "ream", price: 450 },
    { company: "OfficeKing", category: "Office Supplies", product: "Stapler", updated: "Nov 06, 2025", unit: "pcs", price: 200 },

    // IT Equipment
    { company: "Tech Solutions", category: "IT Equipment", product: "Printer", updated: "Nov 02, 2025", unit: "pcs", price: 12000 },
    { company: "CompuWorld", category: "IT Equipment", product: "Router", updated: "Nov 03, 2025", unit: "pcs", price: 3500 },
    { company: "NetGear", category: "IT Equipment", product: "Switch", updated: "Nov 04, 2025", unit: "pcs", price: 4500 },
    { company: "Laptop Pro", category: "IT Equipment", product: "Desktop PC", updated: "Nov 05, 2025", unit: "pcs", price: 60000 },
    { company: "Tech Solutions", category: "IT Equipment", product: "Monitor", updated: "Nov 06, 2025", unit: "pcs", price: 8000 },
    { company: "Printer World", category: "IT Equipment", product: "Scanner", updated: "Nov 07, 2025", unit: "pcs", price: 7500 },

    // Furniture
    { company: "Furniture World", category: "Furniture", product: "Desk Chair", updated: "Nov 03, 2025", unit: "pcs", price: 4500 },
    { company: "Home Office", category: "Furniture", product: "Office Desk", updated: "Nov 04, 2025", unit: "pcs", price: 9500 },
    { company: "Chair Co.", category: "Furniture", product: "Conference Chair", updated: "Nov 05, 2025", unit: "pcs", price: 3500 },
    { company: "FurniPro", category: "Furniture", product: "Bookshelf", updated: "Nov 06, 2025", unit: "pcs", price: 6000 },
    { company: "Desk World", category: "Furniture", product: "Filing Cabinet", updated: "Nov 07, 2025", unit: "pcs", price: 4000 },
    { company: "OfficeKing", category: "Furniture", product: "Reception Sofa", updated: "Nov 08, 2025", unit: "pcs", price: 12000 },

    // Laboratory
    { company: "Lab Equip Co.", category: "Laboratory", product: "Microscope", updated: "Nov 05, 2025", unit: "pcs", price: 15000 },
    { company: "Science Hub", category: "Laboratory", product: "Test Tubes", updated: "Nov 06, 2025", unit: "box", price: 800 },
    { company: "Chem Supplies", category: "Laboratory", product: "Beakers", updated: "Nov 07, 2025", unit: "set", price: 1200 },
    { company: "LabTech", category: "Laboratory", product: "Bunsen Burner", updated: "Nov 08, 2025", unit: "pcs", price: 3500 },
    { company: "Science Hub", category: "Laboratory", product: "Petri Dishes", updated: "Nov 09, 2025", unit: "pack", price: 500 },
    { company: "Lab Equip Co.", category: "Laboratory", product: "Centrifuge", updated: "Nov 10, 2025", unit: "pcs", price: 25000 },

    // Sports
    { company: "Sporty Ltd.", category: "Sports", product: "Basketball", updated: "Nov 04, 2025", unit: "pcs", price: 1200 },
    { company: "Active Gear", category: "Sports", product: "Soccer Ball", updated: "Nov 05, 2025", unit: "pcs", price: 1000 },
    { company: "ProSports", category: "Sports", product: "Tennis Racket", updated: "Nov 06, 2025", unit: "pcs", price: 2500 },
    { company: "Fit Equip", category: "Sports", product: "Yoga Mat", updated: "Nov 07, 2025", unit: "pcs", price: 800 },
    { company: "Sporty Ltd.", category: "Sports", product: "Volleyball", updated: "Nov 08, 2025", unit: "pcs", price: 1100 },
    { company: "Active Gear", category: "Sports", product: "Running Shoes", updated: "Nov 09, 2025", unit: "pair", price: 3000 },

    // Vehicles
    { company: "AutoMax", category: "Vehicles", product: "Sedan Car", updated: "Nov 05, 2025", unit: "pcs", price: 800000 },
    { company: "MotoWorld", category: "Vehicles", product: "Motorbike", updated: "Nov 06, 2025", unit: "pcs", price: 120000 },
    { company: "Truck Hub", category: "Vehicles", product: "Delivery Truck", updated: "Nov 07, 2025", unit: "pcs", price: 1500000 },
    { company: "AutoMax", category: "Vehicles", product: "Van", updated: "Nov 08, 2025", unit: "pcs", price: 600000 },
    { company: "MotoWorld", category: "Vehicles", product: "Scooter", updated: "Nov 09, 2025", unit: "pcs", price: 85000 },
    { company: "Truck Hub", category: "Vehicles", product: "Pickup Truck", updated: "Nov 10, 2025", unit: "pcs", price: 900000 },

    // Printing
    { company: "PrintWorks", category: "Printing", product: "Flyers", updated: "Nov 05, 2025", unit: "pack", price: 500 },
    { company: "PrintPro", category: "Printing", product: "Brochures", updated: "Nov 06, 2025", unit: "pack", price: 800 },
    { company: "PrintWorks", category: "Printing", product: "Business Cards", updated: "Nov 07, 2025", unit: "set", price: 300 },
    { company: "PrintMaster", category: "Printing", product: "Posters", updated: "Nov 08, 2025", unit: "pcs", price: 150 },
    { company: "PrintPro", category: "Printing", product: "Labels", updated: "Nov 09, 2025", unit: "pack", price: 400 },
    { company: "PrintMaster", category: "Printing", product: "Calendars", updated: "Nov 10, 2025", unit: "pcs", price: 700 }
  ];

  const [selectedCategory, setSelectedCategory] = useState(categories[0]);

  const filteredItems = marketItems.filter(item => item.category === selectedCategory);

  return (
    <div className="market-container">
      <h2>🛒 Market</h2>
      <p>Manage procurement and survey items here.</p>

      {/* Category Tags */}
      <div className="market-tags">
        {categories.map((cat, index) => (
          <span
            key={index}
            className={`market-tag ${selectedCategory === cat ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </span>
        ))}
      </div>

      {/* Market Feed */}
      <div className="market-feed">
        {filteredItems.length === 0 && <p>No items in this category.</p>}
        {filteredItems.map((item, index) => (
          <div key={index} className="market-card">
            <h4>{item.company}</h4>
            <p><strong>Product:</strong> {item.product}</p>
            <p><strong>Updated:</strong> {item.updated}</p>
            <p><strong>Unit:</strong> {item.unit}</p>
            <p><strong>Price:</strong> ₱{item.price.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Market;
