const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { uploadBuffer } = require("../utils/supabaseStorage");
const { protect } = require("./authMiddleware");
const pool = require("../db.js");
const notificationService = require("../services/notificationService");

// Configure multer: use memory storage when Supabase is configured, otherwise disk storage
const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let storage;
if (useSupabase) {
  storage = multer.memoryStorage();
} else {
  // Use the same multer storage configuration as in adminRoutes (disk fallback)
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  });
}

const upload = multer({ storage: storage });

const getSupplierIdForUser = async (client, userId) => {
  const result = await client.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
  return result.rows[0]?.SupplierID || null;
};

// @desc    Submit a supplier's quotation response
// @route   POST /api/supplier-responses
// @access  Private (Supplier)
router.post("/", protect, upload.single("responseFile"), async (req, res) => {
  const { supplierFileId } = req.body;

  if (!supplierFileId || !req.file) {
    return res.status(400).json({ message: "Missing supplier file ID or uploaded file." });
  }

  // Determine file path: prefer Supabase blob path when buffer is available and upload succeeds
  let responseFilePath = null;
  if (req.file && req.file.buffer && useSupabase) {
    try {
      const safeName = (req.file.originalname || 'response').replace(/[^a-zA-Z0-9._-]/g, '_');
      const ymd = new Date().toISOString().slice(0, 10);
      const blobName = `responses/${ymd}/file-${supplierFileId}-${Date.now()}-${Math.round(Math.random()*1e6)}-${safeName}`;
      responseFilePath = await uploadBuffer(blobName, req.file.buffer, req.file.mimetype);
    } catch (supaErr) {
      console.error('[responseRoutes] Supabase upload failed:', supaErr && supaErr.message);
      // fallback to disk path if available
      responseFilePath = req.file.path || null;
    }
  } else {
    responseFilePath = req.file ? req.file.path : null;
  }

    const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userId = req.user.userID;
    const supplierId = await getSupplierIdForUser(client, userId);
    if (!supplierId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Supplier profile not found for this user." });
    }

    const supplierFileRes = await client.query(
      'SELECT "SupplierID" FROM "SupplierFiles" WHERE "SupplierFileID" = $1 FOR UPDATE',
      [supplierFileId]
    );

    if (supplierFileRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Supplier assignment not found." });
    }

    if (supplierFileRes.rows[0].SupplierID !== supplierId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "You are not authorised to submit for this assignment." });
    }

    // 1. Insert the response file path into SupplierResponses
    const insertResponseQuery = `INSERT INTO "SupplierResponses" ("SupplierFileID", "ResponseFilePath") VALUES ($1, $2)`;
    await client.query(insertResponseQuery, [supplierFileId, responseFilePath]);

    // 2. Update the status and timestamp in SupplierFiles
    const updateStatusQuery = `
      UPDATE "SupplierFiles"
      SET "Status" = 'Answered',
          "DateResponded" = NOW(),
          "OptInStatus" = 'SUBMITTED',
          "OptedInAt" = COALESCE("OptedInAt", NOW()),
          "DeclinedAt" = NULL,
          "ReuseResponseID" = NULL,
          "LastReusedAt" = NULL
      WHERE "SupplierFileID" = $1
    `;
    await client.query(updateStatusQuery, [supplierFileId]);

    const { rows: fileRows } = await client.query(
      `SELECT pf."FileID" AS "fileId",
              pf."Title" AS "title",
              s."CompanyName" AS "companyName"
         FROM "SupplierFiles" sf
         JOIN "ProcurementFiles" pf ON pf."FileID" = sf."FileID"
         LEFT JOIN "Suppliers" s ON s."SupplierID" = sf."SupplierID"
        WHERE sf."SupplierFileID" = $1
        LIMIT 1`,
      [supplierFileId]
    );
    const fileInfo = fileRows[0] || {};

    await client.query("COMMIT");
    notificationService.notifyAdmins({
      type: "supplier_response_received",
      title: "Supplier submitted a response",
      body: `${fileInfo.companyName || `Supplier ${supplierId}`} responded to ${fileInfo.title || `announcement ${fileInfo.fileId || ''}`}`.trim(),
      metadata: {
        supplierFileId,
        supplierId,
        fileId: fileInfo.fileId || null,
        title: fileInfo.title || null,
      },
    }).catch((err) => {
      console.warn('[responseRoutes] Failed to notify admins of supplier response:', err && err.message ? err.message : err);
    });

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