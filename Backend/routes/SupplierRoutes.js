const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx'); // For reading Excel files
const fs = require('fs');     // For file system operations (deleting temp files)
const { uploadBuffer, generateSignedUrl, downloadFile, deleteFile } = require('../utils/supabaseStorage');
const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// configure multer storage
let storage;
if (useSupabase) {
  storage = multer.memoryStorage();
} else {
  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + '-' + unique + path.extname(file.originalname));
    }
  });
}
const upload = multer({ storage });
const { protect } = require("./authMiddleware");
const pool = require("../db.js"); // Your database connection pool

const toUtcDateOnly = (value) => {
  if (!value && value !== 0) {
    return null;
  }

  const source = value instanceof Date ? value : new Date(value);
  if (!(source instanceof Date) || Number.isNaN(source.getTime())) {
    return null;
  }

  return new Date(Date.UTC(source.getFullYear(), source.getMonth(), source.getDate()));
};

const supplierFileSelectColumns = `
        sf."SupplierFileID",
        sf."Status",
        sf."DateSent" as "dateSent",
        sf."CurrentAttemptNumber" AS "currentAttemptNumber",
        sf."OptInStatus" AS "optInStatus",
        sf."OptedInAt" AS "optedInAt",
        sf."DeclinedAt" AS "declinedAt",
        NULL::int AS "reuseResponseId",
        NULL::timestamptz AS "lastReusedAt",
        pf."FileID",
        pf."Title",
        pf."Description",
        pf."FilePath" as "filePath",
        pf."DatePosted" as "datePosted",
        pf."EndDate" as "endDate",
        COALESCE(statusInfo.attempt_count, 1) AS "attemptCount",
        COALESCE(statusInfo.latest_status, pf."Status") AS "latestStatus",
        pf."Status" AS "procurementStatus",
        COALESCE(statusInfo.latest_note, NULL::text) AS "latestNote",
        COALESCE(statusInfo.latest_changed_at, pf."DatePosted") AS "latestChangedAt",
        lastResponse."ResponseID" AS "lastResponseId",
        lastResponse."ResponseFilePath" AS "lastResponseFilePath",
        lastResponse."DateUploaded" AS "lastResponseDate",
        CASE WHEN pf."EndDate" IS NOT NULL AND (pf."EndDate"::date < ((NOW() AT TIME ZONE 'Asia/Singapore')::date)) THEN TRUE ELSE FALSE END AS "isExpired",
        COALESCE(
          array_to_string(array_agg(DISTINCT c."CategoryName" ORDER BY c."CategoryName"), ', '),
          ''
        ) AS "categories"`;

const supplierFileJoins = `
      FROM "SupplierFiles" sf
      JOIN "ProcurementFiles" pf ON sf."FileID" = pf."FileID"
      LEFT JOIN "ProcurementFileCategories" pfc ON pfc."FileID" = pf."FileID"
      LEFT JOIN "Categories" c ON c."CategoryID" = pfc."CategoryID"
      LEFT JOIN LATERAL (
        SELECT
          sr."ResponseID",
          sr."ResponseFilePath",
          sr."DateUploaded"
        FROM "SupplierResponses" sr
        WHERE sr."SupplierFileID" = sf."SupplierFileID"
        ORDER BY sr."DateUploaded" DESC
        LIMIT 1
      ) lastResponse ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          attempt_count.attempt_count,
          last_row."NewStatus" AS latest_status,
          last_row."Notes" AS latest_note,
          last_row."ChangedAt" AS latest_changed_at
        FROM LATERAL (
          SELECT COALESCE(1 + COUNT(*) FILTER (
                         WHERE h."OldStatus" IN ('FAILED_POSTING', 'COMPLETED') AND h."NewStatus" = 'ACTIVE'
                       ), 1) AS attempt_count
          FROM "ProcurementStatusHistory" h
          WHERE h."FileID" = pf."FileID"
        ) AS attempt_count
        LEFT JOIN LATERAL (
          SELECT h2."NewStatus", h2."Notes", h2."ChangedAt"
          FROM "ProcurementStatusHistory" h2
          WHERE h2."FileID" = pf."FileID"
          ORDER BY h2."ChangedAt" DESC
          LIMIT 1
        ) AS last_row ON TRUE
      ) statusInfo ON TRUE`;

const supplierFileGroupBy = `
      GROUP BY
        sf."SupplierFileID",
        sf."Status",
        sf."DateSent",
        sf."CurrentAttemptNumber",
        sf."OptInStatus",
        sf."OptedInAt",
        sf."DeclinedAt",
        pf."FileID",
        pf."Title",
        pf."Description",
        pf."FilePath",
        pf."DatePosted",
        pf."EndDate",
        pf."Status",
        statusInfo.attempt_count,
        statusInfo.latest_status,
        statusInfo.latest_note,
        statusInfo.latest_changed_at,
        lastResponse."ResponseID",
        lastResponse."ResponseFilePath",
        lastResponse."DateUploaded"`;

const buildSupplierFileQuery = (whereClause, orderClause = 'ORDER BY COALESCE(statusInfo.latest_changed_at, pf."DatePosted", sf."DateSent") DESC, sf."SupplierFileID" DESC') => `
    SELECT
${supplierFileSelectColumns}
${supplierFileJoins}
    WHERE ${whereClause}
${supplierFileGroupBy}
${orderClause ? `    ${orderClause}` : ''}`;

const fetchSupplierFiles = async ({ client, supplierId, supplierFileIds = null, orderClause }) => {
  const params = [supplierId];
  let whereClause = 'sf."SupplierID" = $1';

  if (Array.isArray(supplierFileIds) && supplierFileIds.length > 0) {
    params.push(supplierFileIds);
    whereClause += ` AND sf."SupplierFileID" = ANY($${params.length}::int[])`;
  }

  const query = buildSupplierFileQuery(whereClause, orderClause);
  const { rows } = await client.query(query, params);
  return rows;
};

const getSupplierIdForUser = async (client, userId) => {
  const result = await client.query(
    'SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1',
    [userId]
  );
  return result.rows[0]?.SupplierID || null;
};

// Basic profile fetch for a supplier
router.get('/profile', protect, async (req, res) => {
  try {
    if (!req.user || req.user.role.toLowerCase() !== 'supplier') {
      return res.status(403).json({ message: 'Only suppliers can view this profile.' });
    }

    const userId = req.user.userID;
    const profileRes = await pool.query(
        `SELECT u."UserID" AS "id",
          u."FullName" AS "fullName",
          u."Email" AS "email",
          u."email_verified" AS "email_verified",
          r."RoleName" AS "role",
          s."CompanyName" AS "companyName",
          s."Address" AS "location",
          u."ProfileImageUrl" AS "profileImageUrl",
          u."DateCreated" AS "joinedAt",
          u."SupplierID" AS "supplierId"
           FROM "Users" u
           LEFT JOIN "Roles" r ON r."RoleID" = u."RoleID"
           LEFT JOIN "Suppliers" s ON s."SupplierID" = u."SupplierID"
          WHERE u."UserID" = $1
          LIMIT 1`,
      [userId]
    );

    if (profileRes.rowCount === 0) {
      return res.status(404).json({ message: 'Profile not found.' });
    }

    const profile = profileRes.rows[0];
    const supplierId = profile.supplierId;
    if (!supplierId) {
      return res.status(404).json({ message: 'Supplier profile not found.' });
    }

    const categoriesRes = await pool.query(
      `SELECT ARRAY_REMOVE(ARRAY_AGG(DISTINCT c."CategoryName"), NULL) AS categories
         FROM "SupplierCategories" sc
         JOIN "Categories" c ON c."CategoryID" = sc."CategoryID"
        WHERE sc."SupplierID" = $1`,
      [supplierId]
    );
    const totalProductsRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM "Items" WHERE "SupplierID" = $1',
      [supplierId]
    );

    let signedAvatarUrl = null;
    if (profile.profileImageUrl) {
      try {
        signedAvatarUrl = await generateSignedUrl(profile.profileImageUrl, 60);
      } catch (sigErr) {
        // If the stored path is missing, don't fail the profile payload
        console.warn('[SupplierRoutes] Avatar signed URL failed:', sigErr && sigErr.message ? sigErr.message : sigErr);
        signedAvatarUrl = null;
      }
    }

    return res.json({
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      email_verified: profile.email_verified,
      role: profile.role,
      companyName: profile.companyName,
      location: profile.location,
      profileImageUrl: signedAvatarUrl,
      profileImagePath: profile.profileImageUrl || null,
      categories: categoriesRes.rows[0]?.categories || [],
      totalProducts: totalProductsRes.rows[0]?.count || 0,
      joinedAt: profile.joinedAt,
    });
  } catch (err) {
    console.error('Error fetching supplier profile:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error while fetching profile.' });
  }
});

// Update supplier profile picture
router.post('/profile/avatar', protect, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.user || req.user.role.toLowerCase() !== 'supplier') {
      return res.status(403).json({ message: 'Only suppliers can update this profile.' });
    }

    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ message: 'Avatar file is required.' });
    }

    const userId = req.user.userID;
    const supplierId = await getSupplierIdForUser(pool, userId);
    if (!supplierId) {
      return res.status(404).json({ message: 'Supplier profile not found.' });
    }

    // Capture previous avatar path so we can clean it up after successful upload
    const prevRes = await pool.query('SELECT "ProfileImageUrl" FROM "Users" WHERE "UserID" = $1', [userId]);
    const previousAvatarPath = prevRes.rows[0]?.ProfileImageUrl || null;

    const safeName = (file.originalname || 'avatar').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ymd = new Date().toISOString().slice(0, 10);
    const blobName = `supplier-profile/${supplierId}/${ymd}/avatar-${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`;

    let blobPath;
    try {
      blobPath = await uploadBuffer(blobName, file.buffer, file.mimetype || 'image/png');
    } catch (uploadErr) {
      console.error('[SupplierRoutes] Avatar upload failed:', uploadErr && uploadErr.message ? uploadErr.message : uploadErr);
      return res.status(500).json({ message: 'Failed to upload avatar to storage.' });
    }

    await pool.query('UPDATE "Users" SET "ProfileImageUrl" = $1 WHERE "UserID" = $2', [blobPath, userId]);
    const signedUrl = await generateSignedUrl(blobPath, 60);

    // Best-effort cleanup: delete previous avatar from storage
    if (previousAvatarPath && previousAvatarPath !== blobPath) {
      try {
        await deleteFile(previousAvatarPath);
      } catch (delErr) {
        console.warn('[SupplierRoutes] Failed to delete previous avatar:', delErr && delErr.message ? delErr.message : delErr);
      }
    }

    return res.json({ message: 'Avatar updated.', profileImageUrl: signedUrl, profileImagePath: blobPath });
  } catch (err) {
    console.error('Error updating supplier avatar:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error while updating avatar.' });
  }
});
const generateSupplierFileSasUrls = async (rows) => {
  return Promise.all(rows.map(async (row) => {
    if (row.filePath) {
      try {
        row.fileUrl = await generateSignedUrl(row.filePath, 60);
      } catch (error) {
        console.error('Error generating signed URL for announcement:', error);
        row.fileUrl = null;
      }
    }

    if (row.lastResponseFilePath) {
      try {
        row.lastResponseFileUrl = await generateSignedUrl(row.lastResponseFilePath, 60);
      } catch (error) {
        console.error('Error generating signed URL for response:', error);
        row.lastResponseFileUrl = null;
      }
    }

    return row;
  }));
};
// @desc    Get assigned procurement files for a logged-in supplier
// @route   GET /api/supplier-files
// @access  Private
// @desc    Get assigned procurement files for a logged-in supplier
// @route   GET /api/supplier-files
// @access  Private
router.get("/", protect, async (req, res) => {
  console.log("[SupplierRoutes.js] GET / route hit.");
  const loggedInUserId = req.user.userID;

  try {
    const supplierId = await getSupplierIdForUser(pool, loggedInUserId);

    if (!supplierId) {
      console.log("[SupplierRoutes.js] SupplierID not found for UserID:", loggedInUserId);
      return res.status(404).json({ message: "Supplier profile not found for this user." });
    }

    const assignedFiles = await fetchSupplierFiles({ client: pool, supplierId });
    
    // Generate signed URLs for all files
    const filesWithUrls = await generateSupplierFileSasUrls(assignedFiles);
    
    res.json(filesWithUrls);
    console.log("[SupplierRoutes.js] Successfully fetched assigned files with SAS URLs.");
  } catch (err) {
    console.error("Error fetching supplier files:", err.message);
    res.status(500).json({ message: "Server error while fetching files." });
  }
});

// @desc    Supplier opts into an additional attempt (optionally reusing previous response)
// @route   POST /api/supplier-files/:supplierFileId/opt-in
// @access  Private (Supplier)
router.post("/:supplierFileId/opt-in", protect, async (req, res) => {
  const supplierFileId = parseInt(req.params.supplierFileId, 10);

  if (!Number.isInteger(supplierFileId)) {
    return res.status(400).json({ message: "Invalid supplier file id." });
  }

  const loggedInUserId = req.user.userID;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const supplierId = await getSupplierIdForUser(client, loggedInUserId);
    if (!supplierId) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Supplier profile not found for this user." });
    }

    const supplierFileRes = await client.query(
      'SELECT "SupplierID", "OptInStatus", "CurrentAttemptNumber", "Status" FROM "SupplierFiles" WHERE "SupplierFileID" = $1 FOR UPDATE',
      [supplierFileId]
    );

    if (supplierFileRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Supplier assignment not found." });
    }

    const supplierFileRow = supplierFileRes.rows[0];

    if (supplierFileRow.SupplierID !== supplierId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "You are not authorised to modify this assignment." });
    }

    await client.query(
      `UPDATE "SupplierFiles"
       SET "Status" = 'PENDING',
           "OptInStatus" = 'OPTED_IN',
           "OptedInAt" = NOW(),
           "DeclinedAt" = NULL
       WHERE "SupplierFileID" = $1`,
      [supplierFileId]
    );

    await client.query("COMMIT");

    const [updated] = await fetchSupplierFiles({
      client: pool,
      supplierId,
      supplierFileIds: [supplierFileId],
      orderClause: ''
    });

    return res.json({ message: "Participation confirmed.", supplierFile: updated || null });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error recording supplier opt-in:", err);
    return res.status(500).json({ message: "Server error while recording decision." });
  } finally {
    client.release();
  }
});

// @desc    Supplier declines participation in the current attempt
// @route   POST /api/supplier-files/:supplierFileId/decline
// @access  Private (Supplier)
router.post("/:supplierFileId/decline", protect, async (req, res) => {
  const supplierFileId = parseInt(req.params.supplierFileId, 10);

  if (!Number.isInteger(supplierFileId)) {
    return res.status(400).json({ message: "Invalid supplier file id." });
  }

  const loggedInUserId = req.user.userID;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const supplierId = await getSupplierIdForUser(client, loggedInUserId);
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
      return res.status(403).json({ message: "You are not authorised to modify this assignment." });
    }

    await client.query(
      `UPDATE "SupplierFiles"
       SET "Status" = 'PENDING',
           "OptInStatus" = 'DECLINED',
           "DeclinedAt" = NOW()
       WHERE "SupplierFileID" = $1`,
      [supplierFileId]
    );

    await client.query("COMMIT");

    const [updated] = await fetchSupplierFiles({
      client: pool,
      supplierId,
      supplierFileIds: [supplierFileId],
      orderClause: ''
    });

    return res.json({ message: "You have declined this attempt.", supplierFile: updated || null });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error recording supplier decline:", err);
    return res.status(500).json({ message: "Server error while recording decision." });
  } finally {
    client.release();
  }
});

// @desc    Get status history for a supplier-assigned procurement file
// @route   GET /api/supplier-files/:supplierFileId/status-history
// @access  Private (Supplier)
router.get("/:supplierFileId/status-history", protect, async (req, res) => {
  const supplierFileId = parseInt(req.params.supplierFileId, 10);

  if (!Number.isInteger(supplierFileId)) {
    return res.status(400).json({ message: "Invalid supplier file id." });
  }

  const loggedInUserId = req.user.userID;
  const client = await pool.connect();

  try {
    const supplierId = await getSupplierIdForUser(client, loggedInUserId);
    if (!supplierId) {
      return res.status(404).json({ message: "Supplier profile not found for this user." });
    }

    const assignmentRes = await client.query(
      'SELECT "SupplierID", "FileID" FROM "SupplierFiles" WHERE "SupplierFileID" = $1',
      [supplierFileId]
    );

    if (assignmentRes.rowCount === 0) {
      return res.status(404).json({ message: "Supplier assignment not found." });
    }

    const assignment = assignmentRes.rows[0];
    if (assignment.SupplierID !== supplierId) {
      return res.status(403).json({ message: "Access denied for this status history." });
    }

    const historyQuery = `
      SELECT
        h."HistoryID" AS id,
        h."OldStatus" AS "oldStatus",
        NULL::text AS "newStatus",
        h."ChangedAt" AS "changedAt",
        h."Notes" AS notes,
        h."ChangedBy" AS "changedBy",
        u."FullName" AS "changedByName"
      FROM "ProcurementStatusHistory" h
      LEFT JOIN "Users" u ON u."UserID" = h."ChangedBy"
      WHERE h."FileID" = $1
      ORDER BY h."ChangedAt" DESC
    `;

    const { rows } = await client.query(historyQuery, [assignment.FileID]);
    return res.json(rows);
  } catch (err) {
    console.error("Error fetching supplier status history:", err);
    return res.status(500).json({ message: "Server error while fetching status history." });
  } finally {
    client.release();
  }
});

// ---- Add upload endpoint at bottom ----
router.post('/uploads', protect, upload.single('file'), async (req, res) => { // The 'file' name must match the frontend FormData key
  console.log('[SupplierRoutes] POST /uploads hit');
  const file = req.file;
  console.log('[SupplierRoutes] req.user:', req.user && { userID: req.user.userID, role: req.user.role });
  console.log('[SupplierRoutes] incoming file summary:', file ? {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path || null,
    hasBuffer: Boolean(file.buffer && file.buffer.length)
  } : null);
  let uploadLogId;

  if (!file) {
    return res.status(400).json({ message: 'File is required' });
  }

  try {
    // 1. Authenticate and get SupplierID
    if (!req.user || !req.user.role || req.user.role.toLowerCase() !== 'supplier') {
      return res.status(403).json({ message: 'Only suppliers may upload product files' });
    }
    const userId = req.user.userID;
    const userQ = await pool.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
    const supplierId = userQ.rows[0]?.SupplierID;
    if (!supplierId) return res.status(404).json({ message: 'Supplier profile not found' });

      // 2. Log the upload attempt with 'PROCESSING' status
      // For memory uploads we won't have a disk path yet; insert an empty string to satisfy DB NOT NULL constraint
      const tempPath = file.path || '';
      const logResult = await pool.query(
        `INSERT INTO "SupplierUploads" ("SupplierID", "FilePath", "FileName", "Status") VALUES ($1, $2, $3, 'PROCESSING') RETURNING "UploadID"`,
        [supplierId, tempPath, file.originalname]
      );
    uploadLogId = logResult.rows[0].UploadID;

    // If Supabase is used, upload the original file buffer once and update the SupplierUploads record
    if (useSupabase && file.buffer) {
      try {
        const safeName = (file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
        const ymd = new Date().toISOString().slice(0, 10);
        const blobName = `supplier-uploads/${ymd}/supplier-${supplierId}-${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`;
        const blobPath = await uploadBuffer(blobName, file.buffer, file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await pool.query('UPDATE "SupplierUploads" SET "FilePath" = $1 WHERE "UploadID" = $2', [blobPath, uploadLogId]);
      } catch (supaErr) {
        console.error('[SupplierRoutes] Failed to upload excel file to Supabase Storage:', supaErr);
      }
    }

    // 3. Find and read the correct sheet from the Excel file
    let workbook;
    if (file.buffer) {
      workbook = xlsx.read(file.buffer, { type: 'buffer' });
    } else {
      workbook = xlsx.readFile(file.path);
    }
    let products = [];
    let sheetFound = false;

    // Define the essential headers we need to find (case-insensitive)
    const requiredHeaders = ['name', 'price', 'unit'];

    console.log('[UPLOAD_DEBUG] Workbook sheets found:', workbook.SheetNames);
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      // Convert sheet to JSON to inspect the keys of the first object, which represent the headers
      const sheetDataAsJson = xlsx.utils.sheet_to_json(worksheet);

      if (sheetDataAsJson.length > 0) {
        const firstRowKeys = Object.keys(sheetDataAsJson[0]).map(k => k.toLowerCase().trim());
        console.log(`[UPLOAD_DEBUG] Checking sheet "${sheetName}". Headers found:`, firstRowKeys);
        
        // Check if this sheet contains all the required headers
        const hasRequiredHeaders = requiredHeaders.every(rh => firstRowKeys.some(frk => frk.includes(rh)));

        if (hasRequiredHeaders) {
          products = sheetDataAsJson;
          sheetFound = true;
          console.log(`[UPLOAD_SUCCESS] Found valid product data in sheet: "${sheetName}". Processing ${products.length} rows.`);
          break; // Stop looking once we've found the right sheet
        }
      }
    }

    if (!sheetFound) {
      throw new Error('Upload failed: Could not find a sheet with the required columns (Name, Price, Unit).');
    }

    // 4. Process and save products in a single database transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // --- NEW: Pre-fetch all category names for efficient matching ---
      const allCategoriesResult = await client.query('SELECT "CategoryID", "CategoryName" FROM "Categories"');
      const allCategories = allCategoriesResult.rows.map(c => ({
        id: c.CategoryID,
        name: c.CategoryName.toLowerCase() // Use lowercase for case-insensitive matching
      }));

      // DEBUG: Log the first product row to see its structure
      if (products.length > 0) console.log('[UPLOAD_DEBUG] First product row data:', products[0]);

      const parseExcelDate = (value) => {
        if (value === undefined || value === null || value === "") {
          return null;
        }

        if (value instanceof Date) {
          return Number.isNaN(value.getTime()) ? null : value;
        }

        if (typeof value === "number" && xlsx?.SSF?.parse_date_code) {
          const parsed = xlsx.SSF.parse_date_code(value);
          if (!parsed) {
            return null;
          }
          return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0));
        }

        const str = String(value).trim();
        if (!str) {
          return null;
        }

        const numeric = Number(str);
        if (!Number.isNaN(numeric) && xlsx?.SSF?.parse_date_code) {
          const parsed = xlsx.SSF.parse_date_code(numeric);
          if (parsed) {
            return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0));
          }
        }

        const date = new Date(str);
        return Number.isNaN(date.getTime()) ? null : date;
      };

      for (const product of products) {
        // --- ENHANCED COLUMN MAPPING (Case-Insensitive) ---
        const getVal = (obj, keys) => {
          const lowerCaseObjKeys = Object.keys(obj).reduce((acc, k) => {
            acc[k.toLowerCase().trim()] = obj[k];
            return acc;
          }, {});
          for (const key of keys) {
            if (lowerCaseObjKeys[key.toLowerCase()] !== undefined) return lowerCaseObjKeys[key.toLowerCase()];
          }
          return undefined;
        };

        const name = getVal(product, ['Names', 'Name', 'Product Name', 'Item Name', 'Item']);
        const description = getVal(product, ['Description']);
        const price = parseFloat(getVal(product, ['Price', 'Cost']));
        const unit = getVal(product, ['Unit', 'Unit of Measure']);
        const stock = parseFloat(getVal(product, ['Stock', 'Quantity', 'Qty'])) || 0;
        const location = getVal(product, ['Location']);
        const categoryName = getVal(product, ['Category', 'CategoryName']);
        const datePostedRaw = getVal(product, ['DatePosted', 'Date Posted', 'Posted On', 'Posted']);
        const dateUpdatedRaw = getVal(product, ['DateUpdated', 'Date Updated', 'Updated On', 'Updated']);
        const effectiveUntilRaw = getVal(product, ['EffectiveUntil', 'Effective Until', 'Valid Until', 'Expiry', 'Expiration']);

        if (!name || isNaN(price) || !unit) {
          console.error(`[UPLOAD_SKIP] Skipping row. Reason: Missing required fields. Parsed values -> Name: ${name}, Price: ${price}, Unit: ${unit}. Original Data: ${JSON.stringify(product)}`);
          continue; // Skip rows that are missing essential data
        }

        const datePosted = parseExcelDate(datePostedRaw) || new Date();
        const dateUpdated = parseExcelDate(dateUpdatedRaw) || datePosted;
        const effectiveUntil = toUtcDateOnly(parseExcelDate(effectiveUntilRaw));

        const itemInsertResult = await client.query(
          `INSERT INTO "Items" ("SupplierID", "Name", "Description", "Price", "Stock", "Unit", "Location", "DatePosted", "DateUpdated", "EffectiveUntil", "UploadID")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING "ItemID"`,
          [supplierId, name, description, price, stock, unit, location, datePosted, dateUpdated, effectiveUntil, uploadLogId]
        );
        const newItemId = itemInsertResult.rows[0].ItemID;

        // --- BEST PRACTICE: STRICT COMMA-SEPARATED CATEGORY HANDLING ---
        if (categoryName && typeof categoryName === 'string' && newItemId) {
          const foundCategoryIds = new Set();

          // 1. Split the cell content by commas. This is the only supported delimiter.
          const categoryNamesFromCell = categoryName.split(',').map(c => c.trim()).filter(Boolean);

          // 2. For each name found after splitting, find its corresponding ID.
          for (const namePart of categoryNamesFromCell) {
            const lowerCaseNamePart = namePart.toLowerCase();
            const matchedCat = allCategories.find(c => c.name === lowerCaseNamePart);
            if (matchedCat) {
              foundCategoryIds.add(matchedCat.id);
            } else {
              // Log a warning if a category name from the Excel file is not found in the database.
              console.warn(`[UPLOAD] Category "${namePart}" for item "${name}" was not found in the database and was skipped.`);
            }
          }

          // 3. Insert all unique, valid category IDs that were found into the ItemCategories table.
          for (const categoryId of foundCategoryIds) {
            if (categoryId) { // Final safety check
              await client.query('INSERT INTO "ItemCategories" ("ItemID", "CategoryID") VALUES ($1, $2) ON CONFLICT DO NOTHING', [newItemId, categoryId]);
            } else {
              console.warn(`[UPLOAD] An invalid category ID was found for item "${name}".`);
            }
          }
        }
      }

      await client.query('COMMIT');

      // 5. Update the log to 'COMPLETED' - This now happens inside the 'try' block after a successful COMMIT
      await client.query(
        `UPDATE "SupplierUploads" SET "Status" = 'COMPLETED', "RowCount" = $1, "ProcessedAt" = NOW() WHERE "UploadID" = $2`,
        [products.length, uploadLogId]
      );

      res.status(201).json({ message: `Successfully processed and saved ${products.length} products.`, uploadId: uploadLogId });

    } catch (transactionError) {
      await client.query('ROLLBACK'); // If any item fails, undo all insertions from this file
      throw transactionError; // Let the outer catch block handle it
    } finally {
      client.release(); // Return the database client to the pool
    }
  } catch (err) {
    console.error('Upload error:', err);

    // If processing fails, update the log to 'FAILED'
    if (uploadLogId) {
      await pool.query(`UPDATE "SupplierUploads" SET "Status" = 'FAILED' WHERE "UploadID" = $1`, [uploadLogId]);
    }
    res.status(500).json({ message: 'Server error while processing file', error: err.message });
  } finally {
    // 6. Clean up by deleting the temporary file from the 'uploads/' folder (only when path exists)
    try {
      if (file && file.path) {
        fs.unlink(file.path, (unlinkErr) => {
          if (unlinkErr) console.error('Failed to delete temporary file:', file.path, unlinkErr);
        });
      }
    } catch (cleanupErr) {
      console.error('Error during upload cleanup:', cleanupErr && cleanupErr.message ? cleanupErr.message : cleanupErr);
    }
  }
});

// GET /uploads/history - return upload records for the logged-in supplier
router.get('/uploads/history', protect, async (req, res) => {
  try {
    if (!req.user || !req.user.role || req.user.role.toLowerCase() !== 'supplier') {
      return res.status(403).json({ message: 'Only suppliers may access upload history' });
    }

    const userId = req.user.userID;
    const userQ = await pool.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
    const supplierId = userQ.rows[0]?.SupplierID;
    if (!supplierId) return res.status(404).json({ message: 'Supplier profile not found' });

    const q = `
      SELECT "UploadID", "FileName", "Status", "CreatedAt", "ProcessedAt", "RowCount"
      FROM "SupplierUploads"
      WHERE "SupplierID" = $1
      ORDER BY "CreatedAt" DESC
      LIMIT 100;
    `;
    const { rows } = await pool.query(q, [supplierId]);

    // normalize response for frontend
    const out = rows.map(r => ({ id: r.UploadID, fileName: r.FileName, date: r.CreatedAt, status: r.Status || 'PENDING', rowCount: r.RowCount || 0, processedAt: r.ProcessedAt }));
    res.json(out);
  } catch (err) {
    console.error('Error fetching upload history:', err);
    res.status(500).json({ message: 'Server error fetching upload history' });
  }
});

// POST /items - create a single item (manual add by supplier)
router.post('/items', protect, async (req, res) => {
  try {
    if (!req.user || !req.user.role || req.user.role.toLowerCase() !== 'supplier') {
      return res.status(403).json({ message: 'Only suppliers may add items' });
    }

    const userId = req.user.userID;
    const userQ = await pool.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
    const supplierId = userQ.rows[0]?.SupplierID;
    if (!supplierId) return res.status(404).json({ message: 'Supplier profile not found' });

    const { name, description, price, stock, unit, location, categories, effectiveUntil, datePosted, dateUpdated } = req.body;
    if (!name || !unit) return res.status(400).json({ message: 'Missing required fields: name or unit' });

    const now = new Date();
    const parsedPosted = datePosted ? new Date(datePosted) : now;
    const postedDate = Number.isNaN(parsedPosted.getTime()) ? now : parsedPosted;
    const parsedUpdated = dateUpdated ? new Date(dateUpdated) : postedDate;
    const updatedDate = Number.isNaN(parsedUpdated.getTime()) ? postedDate : parsedUpdated;
    const effectiveUntilValue = toUtcDateOnly(effectiveUntil);
    const parsedPrice = Number(price);
    const priceValue = Number.isFinite(parsedPrice) ? parsedPrice : 0;
    const parsedStock = Number(stock);
    const stockValue = Number.isFinite(parsedStock) ? parsedStock : 0;

    // Insert into Items
    const insertQ = `
      INSERT INTO "Items" ("SupplierID","Name","Description","Price","Stock","Unit","Location","DatePosted","DateUpdated","EffectiveUntil")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING "ItemID";
    `;
    const vals = [
      supplierId,
      name,
      description || null,
      priceValue,
      stockValue,
      unit,
      location || null,
      postedDate,
      updatedDate,
      effectiveUntilValue,
    ];
    const { rows } = await pool.query(insertQ, vals);
    const newItemId = rows[0].ItemID;

    // --- ENHANCED LOGGING ---
    // Create a rich details object for the history log.
    const details = {
      createdItem: { name, price, unit, stock }
    };

    // Log the creation action to ActionHistory
    await pool.query(
      `INSERT INTO "ActionHistory" ("UserID", "SupplierID", "ActionType", "TargetID", "Details") VALUES ($1, $2, $3, $4, $5)`,
      [userId, supplierId, 'ITEM_CREATED', newItemId, JSON.stringify(details)]
    );

    // Insert categories if provided (categories expected as array of ints)
    if (categories && Array.isArray(categories) && categories.length > 0) {
      const catIds = categories.map((c) => parseInt(c, 10)).filter((n) => !Number.isNaN(n));
      if (catIds.length > 0) {
        const insertCats = `
          INSERT INTO "ItemCategories" ("ItemID","CategoryID")
          SELECT $1, t.cat_id FROM UNNEST($2::int[]) AS t(cat_id)
          ON CONFLICT DO NOTHING;
        `;
        await pool.query(insertCats, [newItemId, catIds]);
      }
    }

    res.status(201).json({ message: 'Item created', itemId: newItemId });
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ message: 'Server error creating item', error: err.message });    
  }
});





  
// GET /items - list items for logged-in supplier, optional search q
// GET /items - list items for logged-in supplier, optional search q AND filter

// GET /items - list items for logged-in supplier, with search, category filter, and pagination
router.get('/items', protect, async (req, res) => {
    try {
        if (!req.user || !req.user.role || req.user.role.toLowerCase() !== 'supplier') {
            return res.status(403).json({ message: 'Only suppliers may list items' });
        }
        const userId = req.user.userID;
        const userQ = await pool.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
        const supplierId = userQ.rows[0]?.SupplierID;
        if (!supplierId) return res.status(404).json({ message: 'Supplier profile not found' });

        const q = req.query.q || '';
        const categoryStatus = req.query.categoryStatus; 
        
        // Pagination parameters
        const limit = 50; 
        const page = parseInt(req.query.page, 10) || 1; 
        const offset = (page - 1) * limit; 

        // 1. Base query setup
        const searchQ = `%${q.trim().toLowerCase()}%`;
        const params = [supplierId, searchQ];
        let whereClauses = [`i."SupplierID" = $1`, `LOWER(i."Name") LIKE $2`];
        
        // 2. Add Category Filter Logic
        let categoryFilterClause = '';
        if (categoryStatus && categoryStatus.toLowerCase() === 'none') {
            // Find items that DO NOT have an entry in ItemCategories (i.e., missing categories)
            categoryFilterClause = `AND i."ItemID" NOT IN (SELECT "ItemID" FROM "ItemCategories")`;
        } else if (categoryStatus && parseInt(categoryStatus, 10)) {
            // Filter by a specific CategoryID
            categoryFilterClause = `AND i."ItemID" IN (SELECT "ItemID" FROM "ItemCategories" WHERE "CategoryID" = ${parseInt(categoryStatus, 10)})`;
        }
        
        // 3. Query for the TOTAL COUNT (needed for pagination UI)
        // We must include all filtering conditions in the count query.
        const countQuery = `
            SELECT COUNT(i."ItemID") 
            FROM "Items" i
            WHERE i."SupplierID" = $1 AND LOWER(i."Name") LIKE $2 
            ${categoryFilterClause};
        `;
        const countResult = await pool.query(countQuery, params);
        const totalCount = parseInt(countResult.rows[0].count, 10);
        
        // 4. Construct the main Item listing query
        const baseQuery = `
          SELECT
            i."ItemID" as id, 
            i."Name" as name, 
            i."Description" as description, 
            i."Price" as price, 
            i."Stock" as stock, 
            i."Unit" as unit, 
            i."Location" as location, 
            i."DatePosted" as "datePosted",
            i."DateUpdated" as "dateUpdated",
            i."EffectiveUntil" as "effectiveUntil",
            COALESCE(i."DateUpdated", i."DatePosted") as date,
            COALESCE(ARRAY_AGG(DISTINCT c."CategoryID") FILTER (WHERE c."CategoryID" IS NOT NULL), '{}') as categories,
            COALESCE(STRING_AGG(DISTINCT c."CategoryName", ', ') , 'N/A') as "categoryNames"
          FROM "Items" i
            LEFT JOIN "ItemCategories" ic ON i."ItemID" = ic."ItemID"
            LEFT JOIN "Categories" c ON ic."CategoryID" = c."CategoryID"
            WHERE ${whereClauses.join(' AND ')}
            ${categoryFilterClause}
            GROUP BY i."ItemID"
          ORDER BY COALESCE(i."DateUpdated", i."DatePosted") DESC
            LIMIT ${limit} OFFSET ${offset};
        `;
        
        const { rows } = await pool.query(baseQuery, params);

        // 5. Return the comprehensive response
        res.json({
            items: rows,
            totalItems: totalCount,
            currentPage: page,
            pageSize: limit
        });
        
    } catch (err) {
        console.error('Error listing items:', err);
        res.status(500).json({ message: 'Server error listing items', error: err.message });
    }
});
// GET /categories - list categories assigned to the logged-in supplier
router.get('/categories', protect, async (req, res) => {
  try {
    if (!req.user || !req.user.role || req.user.role.toLowerCase() !== 'supplier') {
      return res.status(403).json({ message: 'Only suppliers may access their categories' });
    }

    const userId = req.user.userID;
    const userQ = await pool.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
    const supplierId = userQ.rows[0]?.SupplierID;
    if (!supplierId) return res.status(404).json({ message: 'Supplier profile not found' });

    const query = `
      SELECT c."CategoryID", c."CategoryName", c."ParentCategoryID"
      FROM "SupplierCategories" sc
      JOIN "Categories" c ON sc."CategoryID" = c."CategoryID"
      WHERE sc."SupplierID" = $1
      ORDER BY c."CategoryName" ASC;
    `;
    const { rows } = await pool.query(query, [supplierId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching supplier categories:', err.message);
    res.status(500).json({ message: 'Server error fetching supplier categories' });
  }
});

// PUT /items/:id - Update a single item
router.put('/items/:id', protect, async (req, res) => {
  const { id } = req.params;
  const itemId = parseInt(id, 10);
  const { name, description, price, stock, unit, location, categories, effectiveUntil } = req.body;

  try {
    // 1. Verify user and get supplier ID
    const userId = req.user.userID;
    const userQ = await pool.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
    const supplierId = userQ.rows[0]?.SupplierID;
    if (!supplierId) return res.status(404).json({ message: 'Supplier profile not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
  
      // 2. Get the old item data for history logging
      const oldItemResult = await client.query('SELECT * FROM "Items" WHERE "ItemID" = $1 AND "SupplierID" = $2', [itemId, supplierId]);
      if (oldItemResult.rowCount === 0) {
        throw new Error('Item not found or you do not have permission to edit it.');
      }
      const oldItem = oldItemResult.rows[0];

      // 3. Update the item  
      const parsedPrice = Number(price);
      const priceValue = Number.isFinite(parsedPrice) ? parsedPrice : 0;
      const parsedStock = Number(stock);
      const stockValue = Number.isFinite(parsedStock) ? parsedStock : 0;
      const parsedEffective = effectiveUntil ? new Date(effectiveUntil) : null;
      const effectiveUntilValue = parsedEffective && !Number.isNaN(parsedEffective.getTime())
        ? parsedEffective.toISOString().slice(0, 10)
        : null;

      await client.query(
        `UPDATE "Items" SET "Name" = $1, "Description" = $2, "Price" = $3, "Stock" = $4, "Unit" = $5, "Location" = $6, "EffectiveUntil" = $7, "DateUpdated" = NOW()
         WHERE "ItemID" = $8 AND "SupplierID" = $9`,
        [name, description, priceValue, stockValue, unit, location, effectiveUntilValue, itemId, supplierId]
      );

      // --- FIX: UPDATE ITEM CATEGORIES ---
      // 1. Delete all existing categories for this item.
      await client.query('DELETE FROM "ItemCategories" WHERE "ItemID" = $1', [itemId]);

      // 2. Insert the new set of categories, if any were provided.
      if (categories && Array.isArray(categories) && categories.length > 0) {
        const catIds = categories.map((c) => parseInt(c, 10)).filter((n) => !Number.isNaN(n));
        if (catIds.length > 0) {
          const insertCatsQuery = `INSERT INTO "ItemCategories" ("ItemID", "CategoryID") SELECT $1, t.cat_id FROM UNNEST($2::int[]) AS t(cat_id) ON CONFLICT DO NOTHING;`;
          await client.query(insertCatsQuery, [itemId, catIds]);
        }
      }
      // --- END OF FIX ---
      
      // 4. Log changes to ActionHistory
      const changes = { Name: name, Description: description, Price: priceValue, Stock: stockValue, Unit: unit, Location: location, EffectiveUntil: effectiveUntilValue };  
      for (const key in changes) {
        if (String(oldItem[key]) !== String(changes[key])) {
          await client.query(
            'INSERT INTO "ActionHistory" ("UserID", "SupplierID", "ActionType", "TargetID", "Details") VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
            [userId, supplierId, 'ITEM_UPDATED', itemId, JSON.stringify({ field: key, oldValue: oldItem[key], newValue: changes[key] })]
          );
        }
      }

      await client.query('COMMIT');
      res.status(200).json({ message: 'Item updated successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error updating item:', err);
    res.status(500).json({ message: 'Server error updating item', error: err.message });
  }
});

// DELETE /items/:id - Delete a single item
router.delete('/items/:id', protect, async (req, res) => {
  const { id } = req.params;
  const itemId = parseInt(id, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user.userID;
    const userQ = await client.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
    const supplierId = userQ.rows[0]?.SupplierID;
    if (!supplierId) {
      throw new Error('Supplier profile not found');
    }

    // --- ENHANCED LOGGING ---
    // 1. Get the item's name BEFORE deleting it.
    const itemQuery = await client.query('SELECT "Name" FROM "Items" WHERE "ItemID" = $1 AND "SupplierID" = $2', [itemId, supplierId]);
    if (itemQuery.rows.length === 0) {
      return res.status(404).json({ message: 'Item not found or you do not have permission to delete it.' });
    }
    const itemName = itemQuery.rows[0].Name;

    // 2. Log the action with the captured name in the details.
    const details = { deletedItemName: itemName };
    await client.query(
      'INSERT INTO "ActionHistory" ("UserID", "SupplierID", "ActionType", "TargetID", "Details") VALUES ($1, $2, $3, $4, $5)',
      [userId, supplierId, 'ITEM_DELETED', itemId, JSON.stringify(details)]
    );

    // 3. Delete the item and its associations.
    await client.query('DELETE FROM "ItemHistory" WHERE "ItemID" = $1', [itemId]);
    await client.query('DELETE FROM "ItemCategories" WHERE "ItemID" = $1', [itemId]);
    await client.query('DELETE FROM "Items" WHERE "ItemID" = $1 AND "SupplierID" = $2', [itemId, supplierId]);

    await client.query('COMMIT');
    res.status(200).json({ message: `Item '${itemName}' deleted successfully` });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ message: 'Server error deleting item', error: err.message });
  }
});

// DELETE /uploads/:id - delete an upload record and all associated items
router.delete('/uploads/:id', protect, async (req, res) => {
  const { id } = req.params;
  const uploadId = parseInt(id, 10);

  if (isNaN(uploadId)) {
    return res.status(400).json({ message: 'Invalid Upload ID.' });
  }

  try {
    // 1. Verify user is a supplier and owns this upload
    if (!req.user || req.user.role.toLowerCase() !== 'supplier') {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    const userId = req.user.userID;
    const userQ = await pool.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
    const supplierId = userQ.rows[0]?.SupplierID;
    if (!supplierId) return res.status(404).json({ message: 'Supplier profile not found.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 2. Delete all associated item categories and items
      await client.query('DELETE FROM "ItemCategories" WHERE "ItemID" IN (SELECT "ItemID" FROM "Items" WHERE "UploadID" = $1 AND "SupplierID" = $2)', [uploadId, supplierId]);
      await client.query('DELETE FROM "Items" WHERE "UploadID" = $1 AND "SupplierID" = $2', [uploadId, supplierId]);

      // 3. Delete the upload record itself
      const deleteUploadResult = await client.query('DELETE FROM "SupplierUploads" WHERE "UploadID" = $1 AND "SupplierID" = $2', [uploadId, supplierId]);

      if (deleteUploadResult.rowCount === 0) {
        throw new Error('Upload not found or you do not have permission to delete it.');
      }

      await client.query('COMMIT');
      res.status(200).json({ message: 'Upload and all associated products have been deleted.' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error deleting upload:', err);
    res.status(500).json({ message: 'Server error while deleting upload.', error: err.message });
  }
});

// @desc    Download supplier response PDF file
// @route   GET /api/supplier-files/:supplierFileId/response-file
// @access  Private (Supplier)
router.get("/:supplierFileId/response-file", protect, async (req, res) => {
  const supplierFileId = parseInt(req.params.supplierFileId, 10);

  if (!Number.isInteger(supplierFileId)) {
    return res.status(400).json({ message: "Invalid supplier file id." });
  }

  const loggedInUserId = req.user.userID;

  try {
    const supplierId = await getSupplierIdForUser(pool, loggedInUserId);
    if (!supplierId) {
      return res.status(404).json({ message: "Supplier profile not found for this user." });
    }

    // Get the response file path
    const query = `
      SELECT sr."ResponseFilePath", pf."Title"
      FROM "SupplierResponses" sr
      JOIN "SupplierFiles" sf ON sr."SupplierFileID" = sf."SupplierFileID"
      JOIN "ProcurementFiles" pf ON sf."FileID" = pf."FileID"
      WHERE sr."SupplierFileID" = $1 AND sf."SupplierID" = $2
      ORDER BY sr."DateUploaded" DESC
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [supplierFileId, supplierId]);

    if (rows.length === 0) {
      console.warn(`[SupplierRoutes.js] response-file: no rows returned for SupplierFileID=${supplierFileId}, SupplierID=${supplierId}`);
      return res.status(404).json({ message: "Response file not found." });
    }

    const filePath = rows[0].ResponseFilePath;
    const title = rows[0].Title;

    console.log(`[SupplierRoutes.js] response-file: found record. SupplierFileID=${supplierFileId} SupplierID=${supplierId} ResponseFilePath=${filePath} Title=${title}`);

    // Download from Supabase
    const stream = await downloadFile(filePath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${title}-response.pdf"`);
    
    stream.pipe(res);
  } catch (err) {
    console.error("Error downloading response file:", err);
    
    if (err.message.includes('not found')) {
      return res.status(404).json({ message: "File not found in storage" });
    }
    
    res.status(500).json({ message: "Error downloading file" });
  }
});
module.exports = router;