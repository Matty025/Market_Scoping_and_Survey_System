import React, { useMemo, useState, useEffect } from "react";
import "./Pagination.css";

const buildPageList = (currentPage, totalPages, maxButtons = 7) => {
  const last = totalPages;
  const buttons = Math.max(3, maxButtons); // ensure room for first/current/last
  if (last <= buttons) {
    return Array.from({ length: last }, (_, i) => i + 1);
  }

  const middleCount = buttons - 2; // slots for numeric buttons between first/last
  const start = Math.max(2, Math.min(currentPage - Math.floor(middleCount / 2), last - middleCount));
  const end = start + middleCount - 1;

  const pages = [1];
  if (start > 2) pages.push("dots");
  for (let i = start; i <= end; i += 1) pages.push(i);
  if (end < last - 1) pages.push("dots");
  pages.push(last);
  return pages;
};

const Pagination = ({ currentPage, totalPages, onPageChange, previewCount = 0 }) => {
  const [maxButtons, setMaxButtons] = useState(() => {
    if (typeof window === "undefined") return 7;
    const w = window.innerWidth;
    if (w < 480) return 3;
    if (w < 768) return 5;
    return 7;
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 480) setMaxButtons(3);
      else if (w < 768) setMaxButtons(5);
      else setMaxButtons(7);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const safeTotal = Math.max(1, totalPages || 1);
  const pages = useMemo(
    () => buildPageList(currentPage, safeTotal, maxButtons),
    [currentPage, safeTotal, maxButtons]
  );

  const goTo = (page) => {
    if (!onPageChange) return;
    const next = Math.min(Math.max(page, 1), safeTotal);
    if (next === currentPage) return;
    onPageChange(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (safeTotal <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="page-control" onClick={() => goTo(1)} disabled={!isPreview && currentPage === 1} aria-label="First page">
        «
      </button>
      <button className="page-control" onClick={() => goTo(currentPage - 1)} disabled={!isPreview && currentPage === 1} aria-label="Previous page">
        ‹
      </button>

      {pages.map((page, idx) =>
        page === "dots" ? (
          <span key={`dots-${idx}`} className="page-dots" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={page}
            className={`page-number ${page === currentPage ? "active" : ""}`}
            onClick={() => goTo(page)}
            aria-current={!isPreview && page === currentPage ? "page" : undefined}
            disabled={isPreview}
          >
            {page}
          </button>
        )
      )}

      <button className="page-control" onClick={() => goTo(currentPage + 1)} disabled={!isPreview && currentPage === safeTotal} aria-label="Next page">
        ›
      </button>
      <button className="page-control" onClick={() => goTo(safeTotal)} disabled={!isPreview && currentPage === safeTotal} aria-label="Last page">
        »
      </button>
    </nav>
  );
};

export default Pagination;
