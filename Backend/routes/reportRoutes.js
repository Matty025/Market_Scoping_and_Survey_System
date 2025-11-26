const express = require("express");
const router = express.Router();
const pool = require("../db");

// Debug helper
function log(title, data) {
  console.log(`[REPORTS DEBUG] ${title}:`, JSON.stringify(data, null, 2));
}

// ------------------------------
// 1️⃣ SUPPLIER SUMMARY
// ------------------------------
router.get("/supplier-summary", async (req, res) => {
  console.log("[API] /supplier-summary called");

  try {
    const result = await pool.query(`
      SELECT 
        s."SupplierID",
        s."CompanyName",
        s."DateCreated",
        COUNT(DISTINCT i."ItemID") AS total_items,
        COUNT(DISTINCT sf."SupplierFileID") AS sent_files,
        COUNT(DISTINCT sr."ResponseID") AS responses
      FROM "Suppliers" s
      LEFT JOIN "Items" i ON s."SupplierID" = i."SupplierID"
      LEFT JOIN "SupplierFiles" sf ON s."SupplierID" = sf."SupplierID"
      LEFT JOIN "SupplierResponses" sr ON sf."SupplierFileID" = sr."SupplierFileID"
      GROUP BY s."SupplierID"
      ORDER BY s."SupplierID"
    `);

    log("Supplier Summary", result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error("[ERROR] /supplier-summary:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// 2️⃣ PRICE ANALYTICS BY SUPPLIER
// ------------------------------
router.get("/price-analytics/:supplierId", async (req, res) => {
  const supplierId = Number(req.params.supplierId);
  if (!supplierId) return res.status(400).json({ error: "Invalid supplierId" });

  console.log("[API] /price-analytics", supplierId);

  try {
    const result = await pool.query(
      `
      SELECT 
        c."CategoryName",
        MAX(i."Price") AS highest,
        MIN(i."Price") AS lowest,
        ROUND(AVG(i."Price")::numeric,2) AS average
      FROM "Items" i
      LEFT JOIN "ItemCategories" ic ON i."ItemID" = ic."ItemID"
      LEFT JOIN "Categories" c ON ic."CategoryID" = c."CategoryID"
      WHERE i."SupplierID" = $1
      GROUP BY c."CategoryName"
      `,
      [supplierId]
    );

    log("Price Analytics", result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error("[ERROR] /price-analytics:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// 3️⃣ TOP ITEMS (MOST EXPENSIVE / CHEAPEST)
// ------------------------------
router.get("/top-items/:supplierId", async (req, res) => {
  const supplierId = Number(req.params.supplierId);
  if (!supplierId) return res.status(400).json({ error: "Invalid supplierId" });

  console.log("[API] /top-items", supplierId);

  try {
    const result = await pool.query(
      `
      SELECT 
        "ItemID",
        "Name",
        "Price",
        "Stock",
        "Unit",
        "Location"
      FROM "Items"
      WHERE "SupplierID" = $1
      ORDER BY "Price" DESC
      LIMIT 10
      `,
      [supplierId]
    );

    log("Top Items", result.rows);
    res.json(result.rows);
  } catch (err) {
    console.error("[ERROR] /top-items:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// 4️⃣ ACTIVITY TIMELINE
// ------------------------------
router.get("/activity-timeline/:supplierId", async (req, res) => {
  const supplierId = Number(req.params.supplierId);
  if (!supplierId) return res.status(400).json({ error: "Invalid supplierId" });

  console.log("[API] /activity-timeline", supplierId);

  try {
    const result = await pool.query(
      `
      SELECT 
        ah."ActionType",
        ah."Details",
        ah."CreatedAt",
        u."FullName",
        u."UserID"
      FROM "ActionHistory" ah
      LEFT JOIN "Users" u ON ah."UserID" = u."UserID"
      WHERE ah."SupplierID" = $1
      ORDER BY ah."CreatedAt" DESC
      LIMIT 30
      `,
      [supplierId]
    );

    const timeline = result.rows.map(row => ({
      ...row,
      CreatedAt: row.CreatedAt.toISOString()
    }));

    log("Activity Timeline", timeline);
    res.json(timeline);
  } catch (err) {
    console.error("[ERROR] /activity-timeline:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// 5️⃣ UPLOADS SUMMARY
// ------------------------------
router.get("/uploads/:supplierId", async (req, res) => {
  const supplierId = Number(req.params.supplierId);
  if (!supplierId) return res.status(400).json({ error: "Invalid supplierId" });

  console.log("[API] /uploads", supplierId);

  try {
    const result = await pool.query(
      `
      SELECT 
        "UploadID",
        "FileName",
        "Status",
        "RowCount",
        "CreatedAt",
        "ProcessedAt"
      FROM "SupplierUploads"
      WHERE "SupplierID" = $1
      ORDER BY "CreatedAt" DESC
      `,
      [supplierId]
    );

    const uploads = result.rows.map(row => ({
      ...row,
      CreatedAt: row.CreatedAt.toISOString(),
      ProcessedAt: row.ProcessedAt ? row.ProcessedAt.toISOString() : null
    }));

    log("Supplier Uploads", uploads);
    res.json(uploads);
  } catch (err) {
    console.error("[ERROR] /uploads:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// 6️⃣ FULL REPORT
// ------------------------------
router.get("/all-reports/:supplierId", async (req, res) => {
  const supplierId = Number(req.params.supplierId);
  if (!supplierId) return res.status(400).json({ error: "Invalid supplierId" });

  console.log("[API] /all-reports", supplierId);

  try {
    const [summary, price, items, timeline, uploads] = await Promise.all([
      pool.query(`
        SELECT 
          s."SupplierID",
          s."CompanyName",
          COUNT(DISTINCT i."ItemID") AS total_items,
          COUNT(DISTINCT sf."SupplierFileID") AS sent_files
        FROM "Suppliers" s
        LEFT JOIN "Items" i ON s."SupplierID" = i."SupplierID"
        LEFT JOIN "SupplierFiles" sf ON s."SupplierID" = sf."SupplierID"
        WHERE s."SupplierID" = $1
        GROUP BY s."SupplierID"
      `, [supplierId]),

      pool.query(`
        SELECT 
          c."CategoryName",
          MAX(i."Price") AS highest,
          MIN(i."Price") AS lowest,
          ROUND(AVG(i."Price")::numeric,2) AS average
        FROM "Items" i
        LEFT JOIN "ItemCategories" ic ON i."ItemID" = ic."ItemID"
        LEFT JOIN "Categories" c ON ic."CategoryID" = c."CategoryID"
        WHERE i."SupplierID" = $1
        GROUP BY c."CategoryName"
      `, [supplierId]),

      pool.query(`
        SELECT "ItemID", "Name", "Price", "Stock", "Unit", "Location"
        FROM "Items"
        WHERE "SupplierID" = $1
        ORDER BY "Price" DESC
        LIMIT 10
      `, [supplierId]),

      pool.query(`
        SELECT ah."ActionType", ah."Details", ah."CreatedAt", u."FullName", u."UserID"
        FROM "ActionHistory" ah
        LEFT JOIN "Users" u ON ah."UserID" = u."UserID"
        WHERE ah."SupplierID" = $1
        ORDER BY ah."CreatedAt" DESC
        LIMIT 30
      `, [supplierId]),

      pool.query(`
        SELECT "FileName", "Status", "CreatedAt", "ProcessedAt"
        FROM "SupplierUploads"
        WHERE "SupplierID" = $1
        ORDER BY "CreatedAt" DESC
      `, [supplierId]),
    ]);

    res.json({
      summary: summary.rows[0],
      priceAnalytics: price.rows,
      topItems: items.rows,
      timeline: timeline.rows.map(row => ({
        ...row,
        CreatedAt: row.CreatedAt.toISOString()
      })),
      uploads: uploads.rows.map(row => ({
        ...row,
        CreatedAt: row.CreatedAt.toISOString(),
        ProcessedAt: row.ProcessedAt ? row.ProcessedAt.toISOString() : null
      }))
    });

  } catch (err) {
    console.error("[ERROR] /all-reports:", err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------
// 7️⃣ SUPPLIER REPORTS (LIST)
// ------------------------------
router.get("/supplier-reports", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        "SupplierID" AS supplier_id,
        "CompanyName" AS name,
        'Active' AS status, 
        "DateCreated" AS lastUpdate
      FROM "Suppliers"
      ORDER BY "SupplierID"
    `);

    res.json(result.rows); // returns array
  } catch (err) {
    console.error("[ERROR] /supplier-reports:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

/* -------------------------
Optional: Dummy Data for Testing
Run in Postgres if your Suppliers table is empty
------------------------- */
/*
INSERT INTO "Suppliers" ("CompanyName", "DateCreated") VALUES 
('Test Supplier A', NOW()),
('Test Supplier B', NOW());

INSERT INTO "Categories" ("CategoryName") VALUES
('Electronics'),
('Furniture');

INSERT INTO "Items" ("Name","Price","Stock","Unit","SupplierID") VALUES
('Laptop', 1200, 10, 'pcs', 1),
('Chair', 150, 20, 'pcs', 2);

INSERT INTO "ItemCategories" ("ItemID","CategoryID") VALUES
(1,1),
(2,2);
*/
