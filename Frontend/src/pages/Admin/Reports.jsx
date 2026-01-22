import React, { useEffect, useState } from "react";
import api from "../../api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import "./Reports.css";
import Pagination from "../../components/Pagination";

const Reports = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { data: suppliersList } = await api.get(
          "/api/reports/supplier-reports"
        );

        if (!suppliersList || suppliersList.length === 0) {
          setSuppliers([]);
          return;
        }

        const fullReports = await Promise.all(
          suppliersList.map(async (s) => {
            try {
              const { data: fullReport } = await api.get(
                `/api/reports/all-reports/${s.supplier_id}`
              );
              return { ...s, ...fullReport };
            } catch {
              return s;
            }
          })
        );

        setSuppliers(fullReports);
      } catch (err) {
        console.error(err);
        setError("Failed to load supplier reports.");
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [suppliers.length]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((suppliers.length || 0) / PAGE_SIZE));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, suppliers.length, PAGE_SIZE]);

  const prepareChartData = (priceAnalytics) => {
    if (!priceAnalytics || priceAnalytics.length === 0) return [];
    return priceAnalytics.map((p) => ({
      category: p.CategoryName || "Unknown",
      highest: Number(p.highest) || 0,
      average: Number(p.average) || 0,
      lowest: Number(p.lowest) || 0,
    }));
  };

  if (loading) {
    return (
      <div className="reports-loading">
        <div className="loading-spinner" aria-hidden />
        <p>Loading supplier reports...</p>
      </div>
    );
  }
  if (error) return <p className="error">{error}</p>;
  if (suppliers.length === 0) return <p>No suppliers found.</p>;

  const totalSuppliers = suppliers.length;
  const suppliersWithAnalytics = suppliers.filter((s) => Array.isArray(s.priceAnalytics) && s.priceAnalytics.length > 0).length;
  const aggregatedTotals = suppliers.reduce(
    (acc, supplier) => {
      acc.items += Number(supplier.summary?.total_items || 0);
      return acc;
    },
    { items: 0 }
  );
  const totalPages = Math.max(1, Math.ceil(totalSuppliers / PAGE_SIZE));
  const startIndex = totalSuppliers === 0 ? 0 : (currentPage - 1) * PAGE_SIZE;
  const paginatedSuppliers = suppliers.slice(startIndex, startIndex + PAGE_SIZE);
  const endIndex = totalSuppliers === 0 ? 0 : Math.min(totalSuppliers, startIndex + PAGE_SIZE);
  const pageSummary = totalSuppliers === 0
    ? "No suppliers to display"
    : `Showing ${startIndex + 1}-${endIndex} of ${totalSuppliers}`;
  const showPagination = totalSuppliers > 0;

  return (
    <div className="reports-container">
      <div className="reports-header">
        <span className="reports-tagline">MSSS Admin Console</span>
        <div className="reports-heading">
          <h2>Supplier Price Trends</h2>
          <p>Monitor pricing behavior across suppliers, compare category performance, and spot areas that need procurement attention.</p>
        </div>
        <div className="reports-meta">
          <span className="reports-meta-pill">
            Suppliers Tracked: <strong>{totalSuppliers}</strong>
          </span>
          <span className="reports-meta-pill">
            With Analytics: <strong>{suppliersWithAnalytics}</strong>
          </span>
          <span className="reports-meta-pill">
            Total Items Covered: <strong>{aggregatedTotals.items}</strong>
          </span>
        </div>
      </div>

      {showPagination && (
        <div className="pagination-wrapper top">
          <div className="pagination-summary">{pageSummary}</div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showPreview
            previewCount={7}
          />
        </div>
      )}

      <div className="supplier-cards-wrapper scrollable">
        {paginatedSuppliers.map((supplier) => {
          const chartData = prepareChartData(supplier.priceAnalytics);

          return (
            <div key={supplier.supplier_id} className={`supplier-card ${chartData.length === 0 ? "no-data" : ""}`}>
              <div className="supplier-header">
                <h3>{supplier.name}</h3>
                <span className={`status ${supplier.status?.toLowerCase() || "unknown"}`}>
                  {supplier.status || "N/A"}
                </span>
              </div>

              <div className="stats-cards">
                <span>Total Items: {supplier.summary?.total_items || 0}</span>
                <span>Activity: {supplier.timeline?.length || 0} actions</span>
                <span>Last Update: {supplier.lastUpdate ? new Date(supplier.lastUpdate).toLocaleString() : 'N/A'}</span>
              </div>

              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `₱${value.toLocaleString()}`} />
                    <Tooltip formatter={(value) => `₱${Number(value).toLocaleString()}`} />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="highest" fill="#16a34a" radius={[6,6,0,0]} />
                    <Bar dataKey="average" fill="#2563eb" radius={[6,6,0,0]} />
                    <Bar dataKey="lowest" fill="#ea580c" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p>No price analytics available for this supplier.</p>
              )}
            </div>
          );
        })}
      </div>

      {showPagination && (
        <div className="pagination-wrapper">
          <div className="pagination-summary">{pageSummary}</div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showPreview
            previewCount={7}
          />
        </div>
      )}
    </div>
  );
};

export default Reports;
