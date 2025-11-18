const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { protect } = require("./authMiddleware");
const pool = require("../db.js");

// --- Multer Configuration for File Uploads ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Make sure this 'uploads' directory exists in your Backend folder
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    // Create a unique filename to avoid conflicts
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// @desc    Get all procurement announcements
// @route   GET /api/admin/announcements
// @access  Private (Admin)
router.get("/announcements", protect, async (req, res) => {
  // Optional: Add role check from req.user if needed
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const result = await pool.query(
      'SELECT "FileID" as id, "Title" as title, "Description" as description, "FilePath" as "filePath", "DatePosted" as posted, "EndDate" as end FROM "ProcurementFiles" ORDER BY "DatePosted" DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching announcements:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Post a new procurement announcement
// @route   POST /api/admin/announcements
// @access  Private (Admin)
router.post("/announcements", protect, upload.single("file"), async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  // suppliers will be a JSON string array like '["1", "3"]'
  const { title, description, categoryId, end } = req.body;
  const suppliers = req.body.suppliers ? JSON.parse(req.body.suppliers) : [];

  const filePath = req.file ? req.file.path : null;

  if (!title || !description || !filePath) {
    return res.status(400).json({ message: "Title, description, and file are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Insert into ProcurementFiles
    const procurementFileQuery = `
      INSERT INTO "ProcurementFiles" ("Title", "Description", "CategoryID", "FilePath", "EndDate")
      VALUES ($1, $2, $3, $4, $5) RETURNING "FileID";
    `;
    const procurementResult = await client.query(procurementFileQuery, [title, description, categoryId || null, filePath, end || null]);
    const newFileId = procurementResult.rows[0].FileID;

    // 2. If suppliers are provided, insert into SupplierFiles
    if (suppliers && suppliers.length > 0) {
      const supplierFileQuery = `
        INSERT INTO "SupplierFiles" ("SupplierID", "FileID", "Status")
        VALUES ($1, $2, 'PENDING');
      `;
      // Loop through each supplier ID and create an entry
      for (const supplierId of suppliers) {
        // Ensure we don't process the 'all' keyword if it slips through
        if (supplierId !== 'all') {
          await client.query(supplierFileQuery, [supplierId, newFileId]);
        }
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Announcement posted successfully!", fileId: newFileId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error posting announcement:", err.message);
    res.status(500).json({ message: "Server error while posting announcement." });
  } finally {
    client.release();
  }
});

// @desc    Get all suppliers
// @route   GET /api/admin/suppliers
// @access  Private (Admin)
router.get("/suppliers", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const result = await pool.query('SELECT "SupplierID", "CompanyName" FROM "Suppliers"');
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching suppliers:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get all procurement categories
// @route   GET /api/admin/categories
// @access  Private (Admin)
router.get("/categories", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }
  try {
    const result = await pool.query('SELECT "CategoryID", "CategoryName" FROM "Categories" ORDER BY "CategoryName" ASC');
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching categories:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get all responses for a specific announcement
// @route   GET /api/admin/announcements/:id/responses
// @access  Private (Admin)
router.get("/announcements/:id/responses", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const query = `
      SELECT
        s."CompanyName" as "companyName",
        sr."ResponseFilePath" as "responseFilePath",
        sr."DateUploaded" as "dateUploaded"
      FROM "SupplierResponses" sr
      JOIN "SupplierFiles" sf ON sr."SupplierFileID" = sf."SupplierFileID"
      JOIN "Suppliers" s ON sf."SupplierID" = s."SupplierID"
      WHERE sf."FileID" = $1
      ORDER BY sr."DateUploaded" DESC;
    `;
    const { rows } = await pool.query(query, [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching announcement responses:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;