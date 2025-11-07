import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import "./Reports.css";

const Reports = () => {
  const suppliers = [
    {
      name: "ABC Supplies",
      status: "Active",
      lastUpdate: "Nov 01, 2025",
      products: [
        { product: "Laptop", category: "Office Supplies", price: 50000 },
        { product: "Notebook", category: "Office Supplies", price: 150 },
        { product: "Printer", category: "IT Equipment", price: 12000 },
      ],
    },
    {
      name: "Tech Solutions",
      status: "Active",
      lastUpdate: "Nov 02, 2025",
      products: [
        { product: "Printer", category: "IT Equipment", price: 12000 },
        { product: "Monitor", category: "IT Equipment", price: 8000 },
        { product: "Router", category: "IT Equipment", price: 3500 },
      ],
    },
    {
      name: "Furniture World",
      status: "Inactive",
      lastUpdate: "Oct 25, 2025",
      products: [
        { product: "Desk Chair", category: "Furniture", price: 4500 },
        { product: "Office Desk", category: "Furniture", price: 9500 },
      ],
    },
  ];

  // Prepare data for chart per supplier
  const prepareChartData = (products) => {
    const categories = {};
    products.forEach(p => {
      if (!categories[p.category]) categories[p.category] = [];
      categories[p.category].push(p.price);
    });

    return Object.keys(categories).map(cat => {
      const prices = categories[cat];
      const highest = Math.max(...prices);
      const lowest = Math.min(...prices);
      const average = Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);
      return { category: cat, highest, lowest, average };
    });
  };

  return (
    <div className="reports-container">
      <h2>📑 Supplier Reports</h2>
      <p>Monitor supplier performance, product updates, and pricing trends visually.</p>

      <div className="supplier-cards">
        {suppliers.map((supplier, idx) => {
          const chartData = prepareChartData(supplier.products);

          return (
            <div key={idx} className="supplier-card">
              <h3>{supplier.name}</h3>
              <p><strong>Status:</strong> {supplier.status}</p>
              <p><strong>Last Update:</strong> {supplier.lastUpdate}</p>

              <hr />
              <p><strong>Price Analytics by Category:</strong></p>

              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="highest" fill="#22c55e" />
                  <Bar dataKey="average" fill="#3b82f6" />
                  <Bar dataKey="lowest" fill="#f97316" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Reports;
