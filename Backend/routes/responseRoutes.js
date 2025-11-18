const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { protect } = require("./authMiddleware");
const pool = require("../db.js");

// Use the same multer storage configuration as in adminRoutes
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

// @desc    Submit a supplier's quotation response
// @route   POST /api/supplier-responses
// @access  Private (Supplier)
router.post("/", protect, upload.single("responseFile"), async (req, res) => {
  const { supplierFileId } = req.body;
  const responseFilePath = req.file ? req.file.path : null;

  if (!supplierFileId || !responseFilePath) {
    return res.status(400).json({ message: "Missing supplier file ID or uploaded file." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Insert the response file path into SupplierResponses
    const insertResponseQuery = `INSERT INTO "SupplierResponses" ("SupplierFileID", "ResponseFilePath") VALUES ($1, $2)`;
    await client.query(insertResponseQuery, [supplierFileId, responseFilePath]);

    // 2. Update the status and timestamp in SupplierFiles
    const updateStatusQuery = `UPDATE "SupplierFiles" SET "Status" = 'Answered', "DateResponded" = NOW() WHERE "SupplierFileID" = $1`;
    await client.query(updateStatusQuery, [supplierFileId]);

    await client.query("COMMIT");
    res.status(201).json({ message: "Response submitted successfully." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error submitting supplier response:", err.message);
    res.status(500).json({ message: "Server error while submitting response." });
  } finally {
    client.release();
  }
});

module.exports = router;