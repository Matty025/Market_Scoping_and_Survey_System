const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { protect } = require("./authMiddleware");
const pool = require("../db.js");
const archiver = require("archiver");
const fs = require("fs");
const { sendPendingAccountEmail, sendAccountStatusEmail } = require("../services/adminNotificationService");
const { notifyBuyerPurchaseStatus } = require("../services/prNotificationService");
const { notifySuppliersPosted, notifyAdminsStatusChange, notifySuppliersStatusChange } = require("../services/announcementNotificationService");
const notificationService = require("../services/notificationService");
// Require buyer routes to reuse history helper
const buyerRoutes = require('./BuyerRoutes');

const FALLBACK_CATEGORY_NAME = "Uncategorized";
const { generateSignedUrl, downloadFile, uploadBuffer } = require('../utils/supabaseStorage');

const parseBooleanQuery = (value) => {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const ensureFallbackCategory = async (client) => {
  const existing = await client.query(
    'SELECT "CategoryID" FROM "Categories" WHERE LOWER("CategoryName") = LOWER($1) LIMIT 1',
    [FALLBACK_CATEGORY_NAME]
  );
  if (existing.rows.length > 0) {
    return existing.rows[0].CategoryID;
  }
  const inserted = await client.query(
    'INSERT INTO "Categories" ("CategoryName") VALUES ($1) RETURNING "CategoryID"',
    [FALLBACK_CATEGORY_NAME]
  );
  return inserted.rows[0].CategoryID;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const VALID_ANNOUNCEMENT_STATUSES = new Set([
  "ACTIVE",
  "COMPLETED",
  "FAILED_POSTING"
]);
const MAX_ATTEMPTS = 3;

const coerceToInt = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const uniqueIntegers = (values = []) => {
  if (!Array.isArray(values)) {
    return [];
  }
  const ints = values
    .map((v) => coerceToInt(v))
    .filter((v) => Number.isInteger(v));
  return Array.from(new Set(ints));
};

const parseJsonArray = (payload) => {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
};

const getAssignedSupplierIds = async (client, fileId) => {
  const targetId = coerceToInt(fileId);
  if (!client || !targetId) {
    return [];
  }

  try {
    const { rows } = await client.query(
      'SELECT DISTINCT "SupplierID" FROM "SupplierFiles" WHERE "FileID" = $1',
      [targetId]
    );
    return rows.map((row) => coerceToInt(row.SupplierID)).filter((id) => Number.isInteger(id));
  } catch (err) {
    console.warn('[adminRoutes] Failed to load assigned suppliers:', err && err.message ? err.message : err);
    return [];
  }
};

const getActiveAttemptCount = async (client, fileId) => {
  const targetId = coerceToInt(fileId);
  if (!client || !targetId) {
    return 0;
  }

  try {
    const { rows } = await client.query(
      `SELECT COALESCE(NULLIF(COUNT(*) FILTER (WHERE "NewStatus" = 'ACTIVE'), 0), 1) AS attempts
         FROM "ProcurementStatusHistory"
        WHERE "FileID" = $1`,
      [targetId]
    );
    const attempts = coerceToInt(rows[0]?.attempts) ?? 1;
    return attempts || 1;
  } catch (err) {
    console.warn('[adminRoutes] Failed to fetch attempt count for file', targetId, err && err.message ? err.message : err);
    return 1;
  }
};

// Cache once to avoid repeated information_schema lookups.
let buyerUploadsNotesColumnExists;
const hasBuyerUploadsNotesColumn = async () => {
  if (buyerUploadsNotesColumnExists !== undefined) {
    return buyerUploadsNotesColumnExists;
  }

  try {
    const { rows } = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'BuyerUploads'
          AND column_name = 'Notes'
      ) AS exists;
    `);

    buyerUploadsNotesColumnExists = Boolean(rows[0] && rows[0].exists);
  } catch (err) {
    console.warn('[adminRoutes] Failed to detect BuyerUploads.Notes column:', err.message);
    buyerUploadsNotesColumnExists = false;
  }

  return buyerUploadsNotesColumnExists;
};

const safeNumber = (value, fallback = null) => {
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

const mapProcurementViewRow = (row) => {
  const rawResponseCount = safeNumber(
    row.RawResponseCount ?? row.rawresponsecount ?? row.ResponseCount ?? row.responsecount,
    0
  );
  const distinctResponderCount = safeNumber(
    row.DistinctResponderCount ?? row.distinctrespondercount ?? row.ResponderCount ?? row.respondercount,
    null
  );
  const respondingSuppliers = distinctResponderCount ?? rawResponseCount ?? 0;

  return {
    id: row.FileID,
    title: row.Title,
    description: row.Description,
    filePath: row.FilePath,
    fileName: row.FileName || null,
    posted: row.DatePosted,
    end: row.EndDate,
    sendType: row.SendType,
    status: row.Status,
    createdBy: row.CreatedBy,
    createdByName: row.CreatedByName,
    createdByEmail: row.CreatedByEmail,
    isExpired: Boolean(row.IsExpired),
    latestChangedAt: row.LatestChangedAt || row.latestChangedAt || row.DatePosted || null,
    totalSuppliersAssigned: Number(row.TotalSuppliersAssigned || 0),
    pendingSupplierCount: Number(row.PendingCount || 0),
    answeredSupplierCount: Number(row.AnsweredCount || 0),
    viewedSupplierCount: Number(row.ViewedCount || 0),
    declinedSupplierCount: Number(row.DeclinedCount || 0),
    responseCount: respondingSuppliers,
    respondingSupplierCount: respondingSuppliers,
    rawResponseCount,
    categories: row.Categories || '',
    categoryIds: Array.isArray(row.CategoryIDs) ? row.CategoryIDs : [],
    suppliers: Array.isArray(row.Suppliers) ? row.Suppliers : [],
    supplierIds: Array.isArray(row.SupplierIDs) ? row.SupplierIDs : [],
    supplierObjects: Array.isArray(row.SupplierObjects) ? row.SupplierObjects : [],
    attemptNumber: safeNumber(row.AttemptNumber, 1),
    attemptStatus: row.AttemptStatus || row.Status || null,
    attemptSentAt: row.AttemptSentAt || null,
    attemptDueAt: row.AttemptDueAt || null,
    procurementStatus: row.ProcurementStatus || row.Status || null,
  };
};

const recordStatusHistory = async (client, {
  fileId,
  oldStatus = null,
  newStatus,
  changedBy = null,
  notes = null,
}) => {
  if (!client || !fileId || !newStatus) {
    return;
  }

  try {
    await client.query(
      `INSERT INTO "ProcurementStatusHistory" ("FileID", "OldStatus", "NewStatus", "ChangedBy", "Notes")
       VALUES ($1, $2, $3, $4, $5)` ,
      [fileId, oldStatus, newStatus, changedBy, notes]
    );
  } catch (err) {
    console.warn(`[ProcurementStatusHistory] Unable to record status change for file ${fileId}: ${err.message}`);
  }
};

// --- Multer Configuration for File Uploads ---
const adminUseSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let adminStorage;
if (adminUseSupabase) {
  adminStorage = multer.memoryStorage();
} else {
  adminStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  });
}

const upload = multer({ storage: adminStorage });

// Lightweight tester to manually trigger pending-account emails
router.post("/notifications/test-pending", protect, async (req, res) => {
  if (!req.user || (req.user.role || "").toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const { to, email, fullName, role, companyName } = req.body || {};
  const target = (to || email || "").trim();

  if (!target) {
    return res.status(400).json({ message: "Missing target email" });
  }

  try {
    console.log(`[adminRoutes] Test pending-email requested by admin ${req.user.userID} -> ${target}`);

    await sendPendingAccountEmail({
      fullName: fullName || "Test Pending User",
      email: email || target,
      role: role || "supplier",
      companyName: companyName || "Test Company",
      toOverride: [target],
    });

    return res.json({ message: "Test pending notification sent", recipients: [target] });
  } catch (err) {
    console.error("[admin/test-pending-email] Failed:", err && err.message ? err.message : err);
    return res.status(500).json({ message: "Failed to send test email" });
  }
});

// @desc    Get all procurement announcements
// @route   GET /api/admin/announcements
// @access  Private (Admin)
router.get("/announcements", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const { search, categoryId, from, to, supplierName, supplierId, status } = req.query;

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      limit = DEFAULT_PAGE_SIZE;
    }
    limit = Math.min(limit, MAX_PAGE_SIZE);

    let page = parseInt(req.query.page, 10);
    if (!Number.isInteger(page) || page <= 0) {
      page = 1;
    }
    const offset = (page - 1) * limit;

    const params = [];
    const where = [];

    if (search && String(search).trim().length > 0) {
      params.push(`%${String(search).toLowerCase().trim()}%`);
      where.push(`(LOWER("Title") LIKE $${params.length} OR LOWER("Description") LIKE $${params.length})`);
    }

    if (from) {
      params.push(from);
      where.push(`"DatePosted"::date >= $${params.length}::date`);
    }

    if (to) {
      params.push(to);
      where.push(`"DatePosted"::date <= $${params.length}::date`);
    }

    const categoryFilter = coerceToInt(categoryId);
    if (categoryFilter !== null) {
      params.push(categoryFilter);
      where.push(`$${params.length} = ANY("CategoryIDs")`);
    }

    const supplierFilter = coerceToInt(supplierId);
    if (supplierFilter !== null) {
      params.push(supplierFilter);
      where.push(`$${params.length} = ANY("SupplierIDs")`);
    } else if (supplierName && supplierName !== 'All') {
      params.push(String(supplierName).toLowerCase().trim());
      where.push(`EXISTS (
        SELECT 1 FROM UNNEST("Suppliers") AS s(name)
        WHERE TRIM(LOWER(s.name)) = TRIM(LOWER($${params.length}))
      )`);
    }

    if (status) {
      const normalizedStatus = String(status).toUpperCase().trim();
      if (VALID_ANNOUNCEMENT_STATUSES.has(normalizedStatus)) {
        params.push(normalizedStatus);
        where.push(`"Status" = $${params.length}`);
      }
    }

    const limitParamIndex = params.length + 1;
    const offsetParamIndex = params.length + 2;

    const baseQuery = `
      WITH filtered AS (
        SELECT
          pf.*,
          (pf."EndDate" IS NOT NULL AND pf."EndDate" < NOW()) AS "IsExpired",
          COALESCE(attempts.attempts, 1) AS "AttemptNumber",
          COALESCE(attempts.latest_changed_at, pf."DatePosted") AS "LatestChangedAt",
          NULL::timestamptz AS "AttemptSentAt",
          NULL::text AS "AttemptStatus",
          COALESCE(response_stats.responder_distinct, 0) AS "DistinctResponderCount",
          COALESCE(response_stats.response_total, 0) AS "RawResponseCount",
          sf_agg.total_suppliers AS "TotalSuppliersAssigned",
          COALESCE(sf_agg.pending_count, 0) AS "PendingCount",
          COALESCE(sf_agg.answered_count, 0) AS "AnsweredCount",
          COALESCE(sf_agg.declined_count, 0) AS "DeclinedCount",
          COALESCE(sf_agg.viewed_count, 0) AS "ViewedCount",
          COALESCE(sf_agg.supplier_ids, ARRAY[]::int[]) AS "SupplierIDs",
          COALESCE(sf_agg.supplier_names, ARRAY[]::text[]) AS "Suppliers",
          COUNT(*) OVER() AS "TotalCountAll"
        FROM "ProcurementFiles" AS pf
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS response_total,
            COUNT(DISTINCT sf."SupplierID") AS responder_distinct
          FROM "SupplierFiles" sf
          JOIN "SupplierResponses" sr ON sr."SupplierFileID" = sf."SupplierFileID"
          WHERE sf."FileID" = pf."FileID"
        ) AS response_stats ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            attempt_count.attempts,
            last_row."ChangedAt" AS latest_changed_at
          FROM (
            SELECT COALESCE(NULLIF(COUNT(*) FILTER (
                        WHERE psh."NewStatus" = 'ACTIVE'
                      ), 0), 1) AS attempts
            FROM "ProcurementStatusHistory" psh
            WHERE psh."FileID" = pf."FileID"
          ) AS attempt_count
          LEFT JOIN LATERAL (
            SELECT h."ChangedAt"
            FROM "ProcurementStatusHistory" h
            WHERE h."FileID" = pf."FileID"
            ORDER BY h."ChangedAt" DESC
            LIMIT 1
          ) AS last_row ON TRUE
        ) AS attempts ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS total_suppliers,
            COUNT(*) FILTER (WHERE sf."Status" = 'PENDING') AS pending_count,
            COUNT(*) FILTER (WHERE sf."Status" = 'ANSWERED') AS answered_count,
            COUNT(*) FILTER (WHERE sf."OptInStatus" = 'DECLINED') AS declined_count,
            COUNT(*) FILTER (WHERE sf."Status" = 'VIEWED') AS viewed_count,
            ARRAY_AGG(DISTINCT sf."SupplierID") AS supplier_ids,
            ARRAY_AGG(DISTINCT COALESCE(NULLIF(TRIM(s."CompanyName"), ''), CONCAT('Supplier ', s."SupplierID"))) AS supplier_names
          FROM "SupplierFiles" sf
          JOIN "Suppliers" s ON s."SupplierID" = sf."SupplierID"
          WHERE sf."FileID" = pf."FileID"
        ) AS sf_agg ON TRUE
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY COALESCE(attempts.latest_changed_at, pf."DatePosted") DESC, pf."FileID" DESC
        LIMIT $${limitParamIndex}
        OFFSET $${offsetParamIndex}
      )
      SELECT * FROM filtered;
    `;

    params.push(limit, offset);

    const { rows } = await pool.query(baseQuery, params);
    const totalCount = rows.length > 0 ? Number(rows[0].TotalCountAll || 0) : 0;

    const mappedRows = rows.map(mapProcurementViewRow);

    if (mappedRows.length > 0) {
      const first = mappedRows[0];
      console.log('[announcements list] sample suppliers len:', Array.isArray(first.suppliers) ? first.suppliers.length : 0, 'supplierIds:', first.supplierIds);
    }

    res.json({
      items: mappedRows,
      total: totalCount,
      page,
      limit
    });
  } catch (err) {
    console.error("Error fetching announcements:", err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
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

  const { title, description, categoryId, end, sendType } = req.body;
  const suppliers = parseJsonArray(req.body.suppliers);
  const targetCategories = parseJsonArray(req.body.categories);
  const normalizedSendType = String(sendType || 'category').toLowerCase() === 'supplier' ? 'supplier' : 'category';
  const createdByUserId = coerceToInt(req.user?.userID || req.user?.id);

  let filePath = null;
  if (req.file) {
    if (adminUseSupabase && req.file.buffer) {
      try {
        const safeName = (req.file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
        const titleSlug = (title || 'announcement').toString().trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'announcement';
        const ymd = new Date().toISOString().slice(0, 10);
        const blobName = `announcements/${ymd}/${titleSlug}-${Date.now()}-${Math.round(Math.random()*1e6)}-${safeName}`;
        filePath = await uploadBuffer(blobName, req.file.buffer, req.file.mimetype);
      } catch (supaErr) {
        console.error('[adminRoutes] Supabase upload failed for announcement file:', supaErr);
        filePath = req.file.path || null;
      }
    } else {
      filePath = req.file.path || null;
    }
  }

  console.log(`[Announcements POST] user=${req.user?.userID} role=${req.user?.role}`);
  console.log(`[Announcements POST] title=${title} categoryId=${categoryId} end=${end}`);
  console.log(`[Announcements POST] sendType=${sendType}`);
  console.log(`[Announcements POST] suppliers(raw)=${req.body.suppliers} parsed=${JSON.stringify(suppliers)}`);
  console.log(`[Announcements POST] categories(raw)=${req.body.categories} parsed=${JSON.stringify(targetCategories)}`);
  console.log(`[Announcements POST] file=${req.file ? req.file.filename : 'none'}`);

  if (!title || !description || !filePath) {
    return res.status(400).json({ message: "Title, description, and file are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const trimmedTitle = String(title).trim();
    const trimmedDescription = String(description).trim();

    const insertFileQuery = `
      INSERT INTO "ProcurementFiles"
        ("Title", "Description", "FilePath", "DatePosted", "EndDate", "SendType", "Status", "CreatedBy")
      VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7)
      RETURNING "FileID", "Status";
    `;

    const fileResult = await client.query(insertFileQuery, [
      trimmedTitle,
      trimmedDescription,
      filePath,
      end || null,
      normalizedSendType,
      'ACTIVE',
      createdByUserId
    ]);

    const newFileId = fileResult.rows[0].FileID;

    const categoryIdsRaw = targetCategories.length > 0 ? targetCategories : (categoryId ? [categoryId] : []);
    const categoryIds = uniqueIntegers(categoryIdsRaw);

    if (categoryIds.length > 0) {
      const insertFileCategoriesQuery = `
        INSERT INTO "ProcurementFileCategories" ("FileID", "CategoryID")
        SELECT $1::int, t.category_id
        FROM UNNEST($2::int[]) AS t(category_id)
        ON CONFLICT DO NOTHING;
      `;
      await client.query(insertFileCategoriesQuery, [newFileId, categoryIds]);
    }

    let supplierIdsToNotify = [];

    if (categoryIds.length > 0 && normalizedSendType === 'category') {
      const findSuppliersQuery = `
        SELECT DISTINCT "SupplierID" FROM "SupplierCategories"
        WHERE "CategoryID" = ANY($1::int[]);
      `;
      const { rows } = await client.query(findSuppliersQuery, [categoryIds]);
      supplierIdsToNotify = rows.map((row) => row.SupplierID);
    }

    if (suppliers.length > 0) {
      const explicitSupplierIds = suppliers.filter((id) => id !== 'all');
      supplierIdsToNotify = supplierIdsToNotify.concat(explicitSupplierIds);
    }

    supplierIdsToNotify = uniqueIntegers(supplierIdsToNotify);

    if (supplierIdsToNotify.length > 0) {
      const supplierFileInsertQuery = `
        INSERT INTO "SupplierFiles" ("SupplierID", "FileID", "Status")
        SELECT DISTINCT t.supplier_id, $2::int, 'PENDING'
        FROM UNNEST($1::int[]) AS t(supplier_id)
        ON CONFLICT ("SupplierID", "FileID") DO UPDATE SET
          "Status" = EXCLUDED."Status",
          "DateResponded" = NULL,
          "CurrentAttemptNumber" = CASE
            WHEN UPPER("SupplierFiles"."Status") = 'ANSWERED'
              THEN COALESCE("SupplierFiles"."CurrentAttemptNumber", 1) + 1
            ELSE GREATEST(COALESCE("SupplierFiles"."CurrentAttemptNumber", 1), 1)
          END,
          "OptInStatus" = 'PENDING',
          "OptedInAt" = NULL,
          "DeclinedAt" = NULL;
      `;
      await client.query(supplierFileInsertQuery, [supplierIdsToNotify, newFileId]);
    }

    await recordStatusHistory(client, {
      fileId: newFileId,
      oldStatus: null,
      newStatus: 'ACTIVE',
      changedBy: createdByUserId,
      notes: 'Initial posting'
    });

    await client.query("COMMIT");

    // Notify suppliers (fire-and-forget)
    if (supplierIdsToNotify.length > 0) {
      notifySuppliersPosted({
        fileId: newFileId,
        title: trimmedTitle,
        supplierIds: supplierIdsToNotify,
        status: 'POSTED',
      }).catch((err) => {
        console.warn('[adminRoutes] Failed to notify suppliers on post:', err && err.message ? err.message : err);
      });
    }

    res.status(201).json({
      message: "Announcement posted successfully!",
      fileId: newFileId,
      status: 'ACTIVE'
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error posting announcement:", err);
    res.status(500).json({ message: "Server error while posting announcement.", error: err.message });
  } finally {
    client.release();
  }
});

// @desc    Edit and repost an existing announcement
// @route   PUT /api/admin/announcements/:id
// @access  Private (Admin)
router.put("/announcements/:id", protect, upload.single("file"), async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const fileId = coerceToInt(req.params.id);
  if (!fileId) {
    return res.status(400).json({ message: "Invalid announcement id." });
  }

  const { title, description, end, sendType } = req.body;
  const suppliersRaw = parseJsonArray(req.body.suppliers);
  const categoriesRaw = parseJsonArray(req.body.categories);
  const singleCategoryId = coerceToInt(req.body.categoryId);
  const sendTypeInput = typeof sendType === 'string' ? sendType.trim().toLowerCase() : null;
  const changedByUserId = coerceToInt(req.user?.userID || req.user?.id);
  const notes = typeof req.body.notes === 'string' && req.body.notes.trim().length > 0 ? req.body.notes.trim() : null;

  const client = await pool.connect();
  let previousStatus = null;
  let oldFilePath = null;
  try {
    await client.query("BEGIN");

    const currentRes = await client.query(
      'SELECT "Title", "Description", "EndDate", "SendType", "Status", "FilePath" FROM "ProcurementFiles" WHERE "FileID" = $1 FOR UPDATE',
      [fileId]
    );

    if (currentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Announcement not found." });
    }

    const existing = currentRes.rows[0];
    previousStatus = existing.Status || null;
    oldFilePath = existing.FilePath;

    const activeAttempts = await getActiveAttemptCount(client, fileId);
    if (previousStatus !== 'ACTIVE' && activeAttempts >= MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Attempt limit reached (max ${MAX_ATTEMPTS}). Reposting is no longer allowed.` });
    }

    const trimmedTitle = typeof title === 'string' ? title.trim() : '';
    const titleToSet = trimmedTitle.length > 0 ? trimmedTitle : existing.Title;
    if (!titleToSet) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Title is required." });
    }

    const trimmedDescription = typeof description === 'string' ? description.trim() : '';
    const descriptionToSet = trimmedDescription.length > 0 ? trimmedDescription : existing.Description;
    if (!descriptionToSet) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Description is required." });
    }

    const endDateToSet = typeof end === 'string' && end.trim().length > 0 ? end.trim() : existing.EndDate;
    let filePathToSet = existing.FilePath;
    if (req.file) {
      if (adminUseSupabase && req.file.buffer) {
        try {
          const safeName = (req.file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
          const titleSlug = (titleToSet || 'announcement').toString().trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'announcement';
          const ymd = new Date().toISOString().slice(0, 10);
          const blobName = `announcements/${ymd}/${titleSlug}-${Date.now()}-${Math.round(Math.random()*1e6)}-${safeName}`;
          filePathToSet = await uploadBuffer(blobName, req.file.buffer, req.file.mimetype);
        } catch (supaErr) {
          console.error('[adminRoutes] Supabase upload failed for announcement edit file:', supaErr);
          filePathToSet = req.file.path || existing.FilePath;
        }
      } else {
        filePathToSet = req.file.path || existing.FilePath;
      }
    }
    const existingSendTypeNormalized = String(existing.SendType || 'category').toLowerCase() === 'supplier' ? 'supplier' : 'category';
    const effectiveSendType = sendTypeInput === 'supplier'
      ? 'supplier'
      : sendTypeInput === 'category'
        ? 'category'
        : existingSendTypeNormalized;

    const existingCategoryRes = await client.query(
      'SELECT "CategoryID" FROM "ProcurementFileCategories" WHERE "FileID" = $1',
      [fileId]
    );
    const existingCategoryIds = uniqueIntegers(existingCategoryRes.rows.map((row) => row.CategoryID));

    const combinedCategoryIds = categoriesRaw.slice();
    if (Number.isInteger(singleCategoryId)) {
      combinedCategoryIds.push(singleCategoryId);
    }
    let categoryIds = uniqueIntegers(combinedCategoryIds);

    if (categoryIds.length === 0) {
      if (effectiveSendType === 'category') {
        categoryIds = existingCategoryIds.length > 0 ? existingCategoryIds : [];
        if (categoryIds.length === 0) {
          const fallbackCategoryId = await ensureFallbackCategory(client);
          categoryIds = [fallbackCategoryId];
        }
      } else {
        categoryIds = existingCategoryIds;
      }
    }

    await client.query('DELETE FROM "ProcurementFileCategories" WHERE "FileID" = $1', [fileId]);
    if (categoryIds.length > 0) {
      await client.query(
        'INSERT INTO "ProcurementFileCategories" ("FileID", "CategoryID") SELECT $1::int, t.category_id FROM UNNEST($2::int[]) AS t(category_id) ON CONFLICT DO NOTHING',
        [fileId, categoryIds]
      );
    }

    let supplierIdsToNotify = [];

    if (categoryIds.length > 0 && effectiveSendType === 'category') {
      const suppliersFromCategories = await client.query(
        'SELECT DISTINCT "SupplierID" FROM "SupplierCategories" WHERE "CategoryID" = ANY($1::int[])',
        [categoryIds]
      );
      supplierIdsToNotify = suppliersFromCategories.rows.map((row) => row.SupplierID);
    }

    if (Array.isArray(suppliersRaw) && suppliersRaw.length > 0) {
      const explicitSupplierIds = suppliersRaw.filter((id) => id !== 'all');
      supplierIdsToNotify = supplierIdsToNotify.concat(explicitSupplierIds);
    }

    supplierIdsToNotify = uniqueIntegers(supplierIdsToNotify);

    if (supplierIdsToNotify.length === 0) {
      await client.query('DELETE FROM "SupplierFiles" WHERE "FileID" = $1', [fileId]);
    } else {
      await client.query('DELETE FROM "SupplierFiles" WHERE "FileID" = $1 AND NOT ("SupplierID" = ANY($2::int[]))', [fileId, supplierIdsToNotify]);
      await client.query(
        `INSERT INTO "SupplierFiles" ("SupplierID", "FileID", "Status")
         SELECT DISTINCT t.supplier_id, $2::int, 'PENDING'
         FROM UNNEST($1::int[]) AS t(supplier_id)
         ON CONFLICT ("SupplierID", "FileID") DO UPDATE SET
           "Status" = EXCLUDED."Status",
           "DateResponded" = NULL,
           "CurrentAttemptNumber" = CASE
             WHEN UPPER("SupplierFiles"."Status") = 'ANSWERED'
               THEN COALESCE("SupplierFiles"."CurrentAttemptNumber", 1) + 1
             ELSE GREATEST(COALESCE("SupplierFiles"."CurrentAttemptNumber", 1), 1)
           END,
            "OptInStatus" = 'PENDING',
            "OptedInAt" = NULL,
            "DeclinedAt" = NULL`,
          [supplierIdsToNotify, fileId]
      );
    }

    const updateRes = await client.query(
      'UPDATE "ProcurementFiles" SET "Title" = $1, "Description" = $2, "EndDate" = $3, "SendType" = $4, "FilePath" = $5, "Status" = \'ACTIVE\', "DatePosted" = NOW() WHERE "FileID" = $6 RETURNING "Status"',
      [titleToSet, descriptionToSet, endDateToSet || null, effectiveSendType, filePathToSet, fileId]
    );

    const newStatus = updateRes.rows[0]?.Status || 'ACTIVE';
    const historyNote = notes || (previousStatus !== newStatus ? 'Announcement edited and reposted' : null);
    if (previousStatus !== newStatus || historyNote) {
      await recordStatusHistory(client, {
        fileId,
        oldStatus: previousStatus,
        newStatus,
        changedBy: changedByUserId,
        notes: historyNote,
      });
    }

    await client.query("COMMIT");

    if (req.file && oldFilePath && oldFilePath !== filePathToSet) {
      fs.unlink(oldFilePath, (unlinkErr) => {
        if (unlinkErr) {
          console.warn(`Unable to remove old file ${oldFilePath}: ${unlinkErr.message}`);
        }
      });
    }

    // Notify suppliers of repost/update (fire-and-forget)
    if (supplierIdsToNotify.length > 0) {
      notifySuppliersPosted({
        fileId,
        title: titleToSet,
        supplierIds: supplierIdsToNotify,
        status: 'REPOSTED',
      }).catch((err) => {
        console.warn('[adminRoutes] Failed to notify suppliers on repost:', err && err.message ? err.message : err);
      });
    }

    const { rows: detailRows } = await pool.query(
      `WITH base AS (
         SELECT pf."FileID", pf."Title", pf."Description", pf."FilePath", pf."DatePosted", pf."EndDate", pf."SendType", pf."Status", pf."CreatedBy",
                u."FullName" AS "CreatedByName", u."Email" AS "CreatedByEmail",
                (pf."EndDate" IS NOT NULL AND pf."EndDate" < NOW()) AS "IsExpired",
                NULL::text AS "FileName"
         FROM "ProcurementFiles" pf
         LEFT JOIN "Users" u ON u."UserID" = pf."CreatedBy"
         WHERE pf."FileID" = $1
       ),
       stats AS (
         SELECT sf."FileID",
                COUNT(*) AS total_suppliers,
                COUNT(*) FILTER (WHERE sf."Status" = 'PENDING') AS pending_count,
                COUNT(*) FILTER (WHERE sf."Status" = 'ANSWERED') AS answered_count,
                0 AS viewed_count,
                COUNT(*) FILTER (WHERE sf."OptInStatus" = 'DECLINED') AS declined_count,
                ARRAY_AGG(DISTINCT sf."SupplierID") AS supplier_ids
         FROM "SupplierFiles" sf
         WHERE sf."FileID" = $1
         GROUP BY sf."FileID"
       ),
       cats AS (
         SELECT pfc."FileID",
                ARRAY_AGG(DISTINCT c."CategoryName") AS names,
                ARRAY_AGG(DISTINCT c."CategoryID") AS ids
         FROM "ProcurementFileCategories" pfc
         JOIN "Categories" c ON c."CategoryID" = pfc."CategoryID"
         WHERE pfc."FileID" = $1
         GROUP BY pfc."FileID"
       ),
       cat_desc AS (
         WITH RECURSIVE cat_tree AS (
           SELECT pfc."CategoryID"
             FROM "ProcurementFileCategories" pfc
            WHERE pfc."FileID" = $1
           UNION ALL
           SELECT c."CategoryID"
             FROM "Categories" c
             JOIN cat_tree ct ON c."ParentCategoryID" = ct."CategoryID"
         )
         SELECT DISTINCT cat_tree."CategoryID" FROM cat_tree
       ),
       cat_suppliers AS (
         SELECT DISTINCT sc."SupplierID" AS supplier_id,
                s."CompanyName" AS company_name,
                u."Email" AS email
           FROM "SupplierCategories" sc
           JOIN cat_desc cd ON cd."CategoryID" = sc."CategoryID"
           JOIN "Suppliers" s ON s."SupplierID" = sc."SupplierID"
           LEFT JOIN "Users" u ON u."SupplierID" = sc."SupplierID"
       ),
       cat_suppliers_agg AS (
         SELECT COUNT(*) AS total_category_suppliers,
                   ARRAY_AGG(DISTINCT company_name) AS company_names,
                   ARRAY_AGG(DISTINCT email) FILTER (WHERE email IS NOT NULL) AS emails,
                   ARRAY_AGG(DISTINCT supplier_id) AS supplier_ids,
                   COALESCE(JSON_AGG(DISTINCT jsonb_build_object(
                     'name', company_name,
                     'email', email,
                     'supplierId', supplier_id
                   )) FILTER (WHERE company_name IS NOT NULL), '[]'::json) AS supplier_objects
           FROM cat_suppliers
       )
       SELECT b.*,
              COALESCE(stats.total_suppliers, 0) AS "TotalSuppliersAssigned",
              COALESCE(cat_suppliers_agg.total_category_suppliers, 0) AS "CategorySupplierCount",
              COALESCE(stats.pending_count, 0) AS "PendingCount",
              COALESCE(stats.answered_count, 0) AS "AnsweredCount",
              COALESCE(stats.viewed_count, 0) AS "ViewedCount",
              COALESCE(stats.declined_count, 0) AS "DeclinedCount",
              COALESCE(array_to_string(cats.names, ', '), '') AS "Categories",
              COALESCE(cats.ids, ARRAY[]::int[]) AS "CategoryIDs",
              COALESCE(stats.supplier_ids, ARRAY[]::int[]) AS "SupplierIDs",
              COALESCE(cat_suppliers_agg.company_names, ARRAY[]::text[]) AS "CategorySuppliers",
              COALESCE(cat_suppliers_agg.emails, ARRAY[]::text[]) AS "CategorySupplierEmails",
              COALESCE(cat_suppliers_agg.supplier_ids, ARRAY[]::int[]) AS "CategorySupplierIds",
              cat_suppliers_agg.supplier_objects AS "CategorySupplierObjects",
              COALESCE(
                (
                  SELECT ARRAY_AGG(DISTINCT s."CompanyName")
                  FROM "Suppliers" s
                  WHERE s."SupplierID" = ANY(COALESCE(stats.supplier_ids, ARRAY[]::int[]))
                ),
                ARRAY[]::text[]
              ) AS "Suppliers",
              COALESCE(attempts.attempt_count, 1) AS "AttemptNumber",
              attempts.latest_active_at AS "AttemptSentAt",
              attempts.latest_status AS "AttemptStatus"
       FROM base b
      LEFT JOIN stats ON stats."FileID" = b."FileID"
      LEFT JOIN cats ON cats."FileID" = b."FileID"
      LEFT JOIN cat_suppliers_agg ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(NULLIF(COUNT(*) FILTER (WHERE h."NewStatus" = 'ACTIVE'), 0), 1) AS attempt_count,
                MAX(CASE WHEN h."NewStatus" = 'ACTIVE' THEN h."ChangedAt" END) AS latest_active_at,
                (
                  SELECT h2."NewStatus"
                  FROM "ProcurementStatusHistory" h2
                  WHERE h2."FileID" = b."FileID"
                  ORDER BY h2."ChangedAt" DESC
                  LIMIT 1
                ) AS latest_status
         FROM "ProcurementStatusHistory" h
         WHERE h."FileID" = b."FileID"
       ) AS attempts ON TRUE`,
      [fileId]
    );

    const announcement = detailRows.length > 0 ? mapProcurementViewRow(detailRows[0]) : null;

    return res.json({
      message: "Announcement updated successfully.",
      announcement,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error updating announcement:", err);
    return res.status(500).json({ message: "Server error while updating announcement.", error: err.message });
  } finally {
    client.release();
  }
});

// @desc    Update announcement status
// @route   PATCH /api/admin/announcements/:id/status
// @access  Private (Admin)
router.patch("/announcements/:id/status", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const fileId = coerceToInt(req.params.id);
  if (!fileId) {
    return res.status(400).json({ message: "Invalid announcement id." });
  }

  const requestedStatus = typeof req.body.status === 'string'
    ? req.body.status.trim().toUpperCase().replace(/\s+/g, '_')
    : '';
  const rawNotes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
  let notes = rawNotes.length > 0 ? rawNotes : null;

  if (!VALID_ANNOUNCEMENT_STATUSES.has(requestedStatus)) {
    return res.status(400).json({ message: `Invalid status. Allowed values: ${Array.from(VALID_ANNOUNCEMENT_STATUSES).join(', ')}` });
  }

  if (!notes) {
    if (requestedStatus === 'FAILED_POSTING') {
      notes = 'Announcement marked as Failed Posting by admin.';
    } else if (requestedStatus === 'COMPLETED') {
      notes = 'Announcement marked as Completed by admin.';
    } else {
      notes = `Status set to ${requestedStatus} by admin.`;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentRes = await client.query(
      'SELECT "Status" FROM "ProcurementFiles" WHERE "FileID" = $1',
      [fileId]
    );

    if (currentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Announcement not found." });
    }

    const previousStatus = currentRes.rows[0].Status || null;

    const activeAttempts = await getActiveAttemptCount(client, fileId);
    if (requestedStatus === 'ACTIVE' && previousStatus !== 'ACTIVE' && activeAttempts >= MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `Attempt limit reached (max ${MAX_ATTEMPTS}). Reposting is no longer allowed.` });
    }

  let announcementTitle = null;
  const assignedSupplierIds = await getAssignedSupplierIds(client, fileId);

    const titleRes = await client.query('SELECT "Title" FROM "ProcurementFiles" WHERE "FileID" = $1', [fileId]);
    if (titleRes.rows.length > 0) {
      announcementTitle = titleRes.rows[0].Title || null;
    }

    if (previousStatus !== requestedStatus) {
      await client.query(
        'UPDATE "ProcurementFiles" SET "Status" = $1 WHERE "FileID" = $2',
        [requestedStatus, fileId]
      );

      await recordStatusHistory(client, {
        fileId,
        oldStatus: previousStatus,
        newStatus: requestedStatus,
        changedBy: coerceToInt(req.user?.userID || req.user?.id),
        notes,
      });
    }

    await client.query("COMMIT");

    notifyAdminsStatusChange({
      fileId,
      title: announcementTitle || `Announcement ${fileId}`,
      status: requestedStatus,
      previousStatus,
      notes,
    }).catch((err) => {
      console.warn('[adminRoutes] Failed to send admin status email:', err && err.message ? err.message : err);
    });

    if (assignedSupplierIds.length > 0) {
      notifySuppliersStatusChange({
        fileId,
        title: announcementTitle || `Announcement ${fileId}`,
        status: requestedStatus,
        previousStatus,
        notes,
        supplierIds: assignedSupplierIds,
      }).catch((err) => {
        console.warn('[adminRoutes] Failed to notify suppliers on status change:', err && err.message ? err.message : err);
      });
    }

    res.json({
      message: "Announcement status updated.",
      fileId,
      previousStatus,
      status: requestedStatus,
      awardedSupplierId: null,
      awardedSupplierName: null,
      losingSupplierIds: [],
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error updating announcement status:", err);
    res.status(500).json({ message: "Server error while updating announcement status.", error: err.message });
  } finally {
    client.release();
  }
});

// @desc    Award announcement to supplier
// @route   PATCH /api/admin/announcements/:id/award
// @access  Private (Admin)
router.patch("/announcements/:id/award", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }
  return res.status(410).json({
    message: "Award workflow has been retired. Use the status endpoint to mark announcements as completed or failed.",
  });
});

// @desc    Get status history for an announcement
// @route   GET /api/admin/announcements/:id/status-history
// @access  Private (Admin)
router.get("/announcements/:id/status-history", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const fileId = coerceToInt(req.params.id);
  if (!fileId) {
    return res.status(400).json({ message: "Invalid announcement id." });
  }

  try {
    const historyQuery = `
      SELECT
        h."HistoryID" AS id,
        h."OldStatus" AS "oldStatus",
        h."NewStatus" AS "newStatus",
        h."ChangedAt" AS "changedAt",
        h."Notes" AS notes,
        h."ChangedBy" AS "changedBy",
        u."FullName" AS "changedByName"
      FROM "ProcurementStatusHistory" h
      LEFT JOIN "Users" u ON u."UserID" = h."ChangedBy"
      WHERE h."FileID" = $1
      ORDER BY h."ChangedAt" DESC
    `;

    const { rows } = await pool.query(historyQuery, [fileId]);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching status history:", err);
    res.status(500).json({ message: "Server error while fetching status history." });
  }
});

// @desc    Delete a procurement announcement
// @route   DELETE /api/admin/announcements/:id
// @access  Private (Admin)
router.delete("/announcements/:id", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const fileId = parseInt(req.params.id, 10);
  if (Number.isNaN(fileId)) {
    return res.status(400).json({ message: "Invalid announcement id." });
  }

  const client = await pool.connect();
  let filePathOnDisk = null;

  try {
    await client.query("BEGIN");

    const fileRes = await client.query(
      'SELECT "FilePath" FROM "ProcurementFiles" WHERE "FileID" = $1',
      [fileId]
    );

    if (fileRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Announcement not found." });
    }

    const storedPath = fileRes.rows[0].FilePath;
    if (storedPath) {
      filePathOnDisk = path.isAbsolute(storedPath)
        ? storedPath
        : path.join(__dirname, "..", storedPath);
    }

    await client.query(
      'DELETE FROM "SupplierResponses" WHERE "SupplierFileID" IN (SELECT "SupplierFileID" FROM "SupplierFiles" WHERE "FileID" = $1)',
      [fileId]
    );
    await client.query('DELETE FROM "SupplierFiles" WHERE "FileID" = $1', [fileId]);
    await client.query('DELETE FROM "ProcurementFileCategories" WHERE "FileID" = $1', [fileId]);
    await client.query('DELETE FROM "ProcurementFiles" WHERE "FileID" = $1', [fileId]);

    await client.query("COMMIT");

    if (filePathOnDisk && fs.existsSync(filePathOnDisk)) {
      fs.unlink(filePathOnDisk, (err) => {
        if (err) {
          console.warn(`[Announcements] Failed to delete file on disk: ${filePathOnDisk}`, err);
        }
      });
    }

    res.json({ message: "Announcement deleted successfully." });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error deleting announcement:", err);
    res.status(500).json({ message: "Server error while deleting announcement." });
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
    const suppliersQuery = `
      SELECT
        s."SupplierID" as id,
        s."CompanyName" as name,
        u."Email" as email,
        s."Address" as location,
        s."DateCreated" as "dateJoined",
        u."AccountStatus" as status,
        u."ProfileImageUrl" as "logoPath",
        (
          SELECT "CategoryName" FROM "Categories" c
          JOIN "SupplierCategories" sc ON c."CategoryID" = sc."CategoryID"
          WHERE sc."SupplierID" = s."SupplierID"
          LIMIT 1
        ) as category,
        (
          SELECT COUNT(*) FROM "Items" i WHERE i."SupplierID" = s."SupplierID"
        ) as "totalProducts"
      FROM "Suppliers" s
      LEFT JOIN "Users" u ON s."SupplierID" = u."SupplierID"
      ORDER BY s."DateCreated" DESC;
    `;
    const { rows } = await pool.query(suppliersQuery);

    const withLogos = await Promise.all(rows.map(async (row) => {
      let logoSignedUrl = null;
      if (row.logoPath) {
        try {
          logoSignedUrl = await generateSignedUrl(row.logoPath, 60);
        } catch (sigErr) {
          console.warn('[adminRoutes] Failed to sign supplier logo for directory:', sigErr && sigErr.message ? sigErr.message : sigErr);
          logoSignedUrl = null;
        }
      }
      return {
        ...row,
        logoPath: row.logoPath || null,
        logoUrl: logoSignedUrl || row.logoPath || null,
      };
    }));

    res.json(withLogos);
  } catch (err) {
    console.error("Error fetching suppliers:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get a single supplier by ID
// @route   GET /api/admin/suppliers/:id
// @access  Private (Admin)
router.get("/suppliers/:id", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: "Supplier ID is required." });
  }

  try {
    const query = `
      SELECT "SupplierID" as id, "CompanyName" as name, "Address" as address
      FROM "Suppliers"
      WHERE "SupplierID" = $1;
    `;
    const { rows } = await pool.query(query, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Supplier not found." });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching single supplier:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get all procurement categories
// @route   GET /api/admin/categories
// @access  Private (Admin)
router.get("/categories", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const result = await pool.query(`
      SELECT
        c."CategoryID",
        c."CategoryName",
        c."ParentCategoryID",
        COALESCE(icounts."ItemCount", 0) AS "ItemCount"
      FROM "Categories" c
      LEFT JOIN (
        SELECT "CategoryID", COUNT(*) AS "ItemCount"
        FROM "ItemCategories"
        GROUP BY "CategoryID"
      ) AS icounts ON icounts."CategoryID" = c."CategoryID"
      ORDER BY c."ParentCategoryID" NULLS FIRST, c."CategoryID" ASC
    `);

    const categories = [];
    const categoryMap = {};

    result.rows.forEach(row => {
      categoryMap[row.CategoryID] = {
        CategoryID: row.CategoryID,
        CategoryName: row.CategoryName,
        ParentCategoryID: row.ParentCategoryID,
        ItemCount: Number(row.ItemCount ?? 0),
        Subcategories: []
      };
    });

    result.rows.forEach(row => {
      if (row.ParentCategoryID && categoryMap[row.ParentCategoryID]) {
        categoryMap[row.ParentCategoryID].Subcategories.push(
          categoryMap[row.CategoryID]
        );
      } else {
        categories.push(categoryMap[row.CategoryID]);
      }
    });

    res.json(categories);
  } catch (err) {
    console.error("Error fetching categories:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Create a new procurement category
// @route   POST /api/admin/categories
// @access  Private (Admin)
router.post("/categories", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const { name, parentCategoryId } = req.body;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return res.status(400).json({ message: "Category name is required." });
  }

  let parentId = null;
  if (parentCategoryId !== null && parentCategoryId !== undefined && parentCategoryId !== "") {
    const parsed = Number(parentCategoryId);
    if (Number.isNaN(parsed)) {
      return res.status(400).json({ message: "Parent category id must be numeric." });
    }
    parentId = parsed;

    try {
      const parentCheck = await pool.query('SELECT "CategoryID" FROM "Categories" WHERE "CategoryID" = $1', [parentId]);
      if (parentCheck.rows.length === 0) {
        return res.status(400).json({ message: "Parent category not found." });
      }
    } catch (err) {
      console.error("Error validating parent category:", err.message);
      return res.status(500).json({ message: "Server error" });
    }
  }

  try {
    const insertQuery = `
      INSERT INTO "Categories" ("CategoryName", "ParentCategoryID")
      VALUES ($1, $2)
      RETURNING "CategoryID", "CategoryName", "ParentCategoryID"
    `;
    const { rows } = await pool.query(insertQuery, [trimmedName, parentId]);
    res.status(201).json({ category: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Category name already exists." });
    }
    console.error("Error creating category:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Update an existing procurement category
// @route   PUT /api/admin/categories/:id
// @access  Private (Admin)
router.put("/categories/:id", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId)) {
    return res.status(400).json({ message: "Valid category id is required." });
  }

  const { name, parentCategoryId } = req.body;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedName) {
    return res.status(400).json({ message: "Category name is required." });
  }

  let parentId = null;
  if (parentCategoryId !== null && parentCategoryId !== undefined && parentCategoryId !== "") {
    const parsed = Number(parentCategoryId);
    if (Number.isNaN(parsed)) {
      return res.status(400).json({ message: "Parent category id must be numeric." });
    }
    parentId = parsed;
  }

  if (parentId === categoryId) {
    return res.status(400).json({ message: "A category cannot be its own parent." });
  }

  try {
    const existing = await pool.query('SELECT "CategoryID", "ParentCategoryID" FROM "Categories" WHERE "CategoryID" = $1', [categoryId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Category not found." });
    }

    if (parentId !== null) {
      const parentCheck = await pool.query('SELECT "CategoryID", "ParentCategoryID" FROM "Categories" WHERE "CategoryID" = $1', [parentId]);
      if (parentCheck.rows.length === 0) {
        return res.status(400).json({ message: "Parent category not found." });
      }

      let ancestorId = parentCheck.rows[0].ParentCategoryID;
      while (ancestorId) {
        if (ancestorId === categoryId) {
          return res.status(400).json({ message: "Cannot assign a descendant as parent." });
        }
        const ancestorRes = await pool.query('SELECT "ParentCategoryID" FROM "Categories" WHERE "CategoryID" = $1', [ancestorId]);
        if (ancestorRes.rows.length === 0) break;
        ancestorId = ancestorRes.rows[0].ParentCategoryID;
      }
    }

    const updateQuery = `
      UPDATE "Categories"
      SET "CategoryName" = $1,
          "ParentCategoryID" = $2
      WHERE "CategoryID" = $3
      RETURNING "CategoryID", "CategoryName", "ParentCategoryID"
    `;
    const { rows } = await pool.query(updateQuery, [trimmedName, parentId, categoryId]);
    res.json({ category: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Category name already exists." });
    }
    console.error("Error updating category:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Delete a procurement category
// @route   DELETE /api/admin/categories/:id
// @access  Private (Admin)
router.delete("/categories/:id", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId)) {
    return res.status(400).json({ message: "Valid category id is required." });
  }

  const forceDelete = parseBooleanQuery(req.query.force);
  const fallbackParam = req.query.fallbackCategoryId;
  let fallbackCategoryId = null;
  let reassignedItems = 0;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      'SELECT "CategoryID" FROM "Categories" WHERE "CategoryID" = $1',
      [categoryId]
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Category not found." });
    }

    const childCheck = await client.query(
      'SELECT 1 FROM "Categories" WHERE "ParentCategoryID" = $1 LIMIT 1',
      [categoryId]
    );
    if (childCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Remove or reassign subcategories before deleting this category." });
    }

    const procurementUsage = await client.query(
      'SELECT 1 FROM "ProcurementFileCategories" WHERE "CategoryID" = $1 LIMIT 1',
      [categoryId]
    );
    if (procurementUsage.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ message: "Category is linked to procurement files. Remove those links first." });
    }

    const supplierUsage = await client.query(
      'SELECT 1 FROM "SupplierCategories" WHERE "CategoryID" = $1 LIMIT 1',
      [categoryId]
    );
    if (supplierUsage.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ message: "Category is linked to suppliers. Remove those links first." });
    }

    const itemUsageRes = await client.query(
      'SELECT COUNT(*)::int AS count FROM "ItemCategories" WHERE "CategoryID" = $1',
      [categoryId]
    );
    const itemUsageCount = itemUsageRes.rows[0]?.count ?? 0;

    if (itemUsageCount > 0) {
      if (!forceDelete) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: "Category is linked to items. Reassign them or resend the request with force=true to move items into a fallback category.",
        });
      }

      if (fallbackParam !== undefined && fallbackParam !== null && fallbackParam !== "") {
        const parsedFallback = Number(fallbackParam);
        if (!Number.isInteger(parsedFallback)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Fallback category id must be numeric." });
        }
        fallbackCategoryId = parsedFallback;
      } else {
        fallbackCategoryId = await ensureFallbackCategory(client);
      }

      if (fallbackCategoryId === categoryId) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Fallback category must be different from the category being deleted." });
      }

      const fallbackExists = await client.query(
        'SELECT "CategoryID" FROM "Categories" WHERE "CategoryID" = $1',
        [fallbackCategoryId]
      );
      if (fallbackExists.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Fallback category not found." });
      }

      const reassignment = await client.query(
        'UPDATE "ItemCategories" SET "CategoryID" = $1 WHERE "CategoryID" = $2 RETURNING "ItemID"',
        [fallbackCategoryId, categoryId]
      );
      reassignedItems = reassignment.rowCount ?? 0;
    }

    await client.query('DELETE FROM "Categories" WHERE "CategoryID" = $1', [categoryId]);
    await client.query("COMMIT");

    return res.json({
      message: "Category deleted.",
      force: forceDelete,
      fallbackCategoryId,
      reassignedItems,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error deleting category:", err.message);
    return res.status(500).json({ message: "Server error while deleting category." });
  } finally {
    client.release();
  }
});

// @desc    Get mapping of procurement FileID to categories
// @route   GET /api/admin/file-categories
// @access  Private (Admin)
router.get("/file-categories", protect, async (req, res) => {
  try {
    if (req.user.role.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    const q = `
      SELECT pfc."FileID", pfc."CategoryID", c."CategoryName"
      FROM "ProcurementFileCategories" pfc
      JOIN "Categories" c ON c."CategoryID" = pfc."CategoryID"
      ORDER BY pfc."FileID" ASC, pfc."CategoryID" ASC
    `;
    const { rows } = await pool.query(q);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching file-categories:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin: list users (optional ?status=)
router.get('/users', protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }

  try {
    const { status } = req.query;
    let query = `SELECT u."UserID", u."FullName", u."Email", r."RoleName", u."AccountStatus", u."SupplierID" FROM "Users" u LEFT JOIN "Roles" r ON r."RoleID" = u."RoleID"`;
    const params = [];
    if (status) {
      query += ` WHERE u."AccountStatus" = $1`;
      params.push(status.toUpperCase());
    }
    query += ` ORDER BY u."UserID" DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching users:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: update user account status
router.patch('/users/:id', protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  const userId = parseInt(req.params.id, 10);
  const { status, notes } = req.body || {};
  if (!userId || !status) return res.status(400).json({ message: 'Missing user id or status' });

  const allowed = ['PENDING','APPROVED','REJECTED','BLACKLISTED'];
  const normalized = String(status).toUpperCase();
  if (!allowed.includes(normalized)) return res.status(400).json({ message: 'Invalid status' });

  try {
    const updateQ = `UPDATE "Users" SET "AccountStatus" = $1 WHERE "UserID" = $2 RETURNING "UserID","FullName","Email","AccountStatus"`;
    const { rows } = await pool.query(updateQ, [normalized, userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const updatedUser = rows[0];

    // Fire-and-forget email to the specific user only
    sendAccountStatusEmail({
      email: updatedUser.Email,
      fullName: updatedUser.FullName,
      status: normalized,
      notes,
    }).catch((err) => {
      console.warn('[adminRoutes] Failed to send account status email:', err && err.message ? err.message : err);
    });

    res.json({ message: 'User status updated', user: updatedUser });
  } catch (err) {
    console.error('Error updating user status:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// @desc    Get all responses for a specific announcement
// @route   GET /api/admin/announcements/:id/responses
// @access  Private (Admin)
router.get("/announcements/:id/responses", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const fileId = parseInt(req.params.id, 10);
  if (!Number.isInteger(fileId)) {
    return res.status(400).json({ message: "Invalid announcement id." });
  }

  const attemptNumber = req.query.attemptNumber ? parseInt(req.query.attemptNumber, 10) : null;

  try {
    const params = [fileId];
    let whereClause = 'sf."FileID" = $1';

    if (Number.isInteger(attemptNumber) && attemptNumber > 0) {
      params.push(attemptNumber);
      whereClause += ` AND COALESCE(sf."CurrentAttemptNumber", 1) = $${params.length}`;
    }

    const query = `
      SELECT
        sf."SupplierFileID"       AS "supplierFileId",
        s."SupplierID"            AS "supplierId",
        s."CompanyName"           AS "companyName",
        sf."Status"               AS "supplierFileStatus",
        sf."OptInStatus"          AS "optInStatus",
        sf."CurrentAttemptNumber" AS "currentAttemptNumber",
        sf."OptedInAt"            AS "optedInAt",
        sf."DeclinedAt"           AS "declinedAt",
        NULL::timestamptz          AS "lastReusedAt",
        sf."DateResponded"        AS "dateResponded",
        latest."ResponseID"       AS "responseId",
        latest."ResponseFilePath" AS "responseFilePath",
        latest."DateUploaded"     AS "dateUploaded",
        latest."IsReused"         AS "isReused",
        latest."SourceResponseID" AS "sourceResponseId",
        COALESCE(history.responses, '[]'::json) AS "responseHistory"
      FROM "SupplierFiles" sf
      JOIN "Suppliers" s ON s."SupplierID" = sf."SupplierID"
      LEFT JOIN LATERAL (
        SELECT
          sr."ResponseID",
          sr."ResponseFilePath",
          sr."DateUploaded",
          sr."IsReused",
          sr."SourceResponseID"
        FROM "SupplierResponses" sr
        WHERE sr."SupplierFileID" = sf."SupplierFileID"
        ORDER BY sr."DateUploaded" DESC NULLS LAST, sr."ResponseID" DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(
            json_build_object(
              'responseId', resp."ResponseID",
              'responseFilePath', resp."ResponseFilePath",
              'dateUploaded', resp."DateUploaded",
              'isReused', resp."IsReused",
              'sourceResponseId', resp."SourceResponseID",
              'attemptIndex', resp.attempt_index
            ) ORDER BY resp.attempt_index
          ) AS responses
        FROM (
          SELECT
            sr."ResponseID",
            sr."ResponseFilePath",
            sr."DateUploaded",
            sr."IsReused",
            sr."SourceResponseID",
            ROW_NUMBER() OVER (
              ORDER BY sr."DateUploaded" ASC NULLS LAST, sr."ResponseID" ASC
            ) AS attempt_index
          FROM "SupplierResponses" sr
          WHERE sr."SupplierFileID" = sf."SupplierFileID"
        ) resp
      ) history ON TRUE
      WHERE ${whereClause}
      ORDER BY
        CASE WHEN latest."DateUploaded" IS NULL THEN 1 ELSE 0 END,
        latest."DateUploaded" DESC NULLS LAST,
        s."CompanyName" ASC;
    `;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching announcement responses:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Stream the latest (or specific) supplier response PDF for admins
// @route   GET /api/admin/supplier-files/:supplierFileId/response-file?responseId=optional
// @access  Private (Admin)
router.get("/supplier-files/:supplierFileId/response-file", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const supplierFileId = parseInt(req.params.supplierFileId, 10);
  const responseId = req.query.responseId ? parseInt(req.query.responseId, 10) : null;

  if (!Number.isInteger(supplierFileId)) {
    return res.status(400).json({ message: "Invalid supplier file id." });
  }

  try {
    const params = [supplierFileId];
    let whereClause = 'sr."SupplierFileID" = $1';

    if (Number.isInteger(responseId)) {
      params.push(responseId);
      whereClause += ` AND sr."ResponseID" = $${params.length}`;
    }

    const query = `
      SELECT sr."ResponseFilePath", sr."ResponseID", pf."Title"
      FROM "SupplierResponses" sr
      JOIN "SupplierFiles" sf ON sr."SupplierFileID" = sf."SupplierFileID"
      JOIN "ProcurementFiles" pf ON sf."FileID" = pf."FileID"
      WHERE ${whereClause}
      ORDER BY sr."DateUploaded" DESC NULLS LAST, sr."ResponseID" DESC
      LIMIT 1
    `;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ message: "Response file not found." });
    }

    const filePath = rows[0].ResponseFilePath;
    const title = rows[0].Title || `response-${supplierFileId}`;

    const stream = await downloadFile(filePath);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${title}-response.pdf"`);

    stream.pipe(res);
  } catch (err) {
    console.error("Error downloading response file (admin):", err);

    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ message: "File not found in storage" });
    }

    res.status(500).json({ message: "Error downloading file" });
  }
});

// @desc    Get all market items with advanced filtering for Admin
// @route   GET /api/admin/market-items
// @access  Private (Admin)
router.get("/market-items", protect, async (req, res) => {
  try {
    if (req.user.role.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    const { search, category, supplier, date } = req.query;

    const queryParams = [];
    const whereClauses = [];

    let baseQuery = `
      SELECT
        i."ItemID" AS id,
        i."Name" AS name,
        i."Description" AS description,
        i."Price" AS price,
        i."Stock" AS stock,
        i."Unit" AS unit,
        i."Location" AS location,
        i."DatePosted" AS "datePosted",
        i."DateUpdated" AS "dateUpdated",
        COALESCE(i."DateUpdated", i."DatePosted") AS date,
        i."EffectiveUntil" AS "effectiveUntil",
        s."CompanyName" AS company,
        COALESCE(MAX(u."ProfileImageUrl"), NULL) AS "logoPath",
        STRING_AGG(c."CategoryName", ', ') AS categories
      FROM "Items" i
      JOIN "Suppliers" s ON i."SupplierID" = s."SupplierID"
      LEFT JOIN "Users" u ON u."SupplierID" = s."SupplierID"
      LEFT JOIN "ItemCategories" ic ON i."ItemID" = ic."ItemID"
      LEFT JOIN "Categories" c ON ic."CategoryID" = c."CategoryID"
    `;

    if (search) {
      queryParams.push(`%${search.toLowerCase()}%`);
      whereClauses.push(
        `(LOWER(i."Name") LIKE $${queryParams.length} OR LOWER(s."CompanyName") LIKE $${queryParams.length})`
      );
    }

    if (supplier) {
      queryParams.push(supplier);
      whereClauses.push(`i."SupplierID" = $${queryParams.length}`);
    }

    if (date) {
      queryParams.push(date);
      queryParams.push(date);
      whereClauses.push(
        `i."DateUpdated"::date >= $${queryParams.length - 1}::date AND i."DateUpdated"::date <= $${queryParams.length}::date`
      );
    }

    if (category) {
      queryParams.push(category);
      whereClauses.push(`
        i."ItemID" IN (
          WITH RECURSIVE subcategories AS (
            SELECT "CategoryID" FROM "Categories" WHERE "CategoryID" = $${queryParams.length}
            UNION ALL
            SELECT c_sub."CategoryID"
            FROM "Categories" c_sub
            INNER JOIN subcategories sc ON c_sub."ParentCategoryID" = sc."CategoryID"
          )
          SELECT ic."ItemID"
          FROM "ItemCategories" ic
          WHERE ic."CategoryID" IN (SELECT "CategoryID" FROM subcategories)
        )
      `);
    }

    if (whereClauses.length > 0) {
      baseQuery += " WHERE " + whereClauses.join(" AND ");
    }

    baseQuery += `
      GROUP BY i."ItemID", s."CompanyName"
      ORDER BY COALESCE(i."DateUpdated", i."DatePosted") DESC
    `;

    const { rows } = await pool.query(baseQuery, queryParams);

    const result = await Promise.all(rows.map(async (item) => {
      let logoSignedUrl = null;
      if (item.logoPath) {
        try {
          logoSignedUrl = await generateSignedUrl(item.logoPath, 60);
        } catch (sigErr) {
          console.warn('[adminRoutes] Failed to sign supplier logo:', sigErr && sigErr.message ? sigErr.message : sigErr);
          logoSignedUrl = null;
        }
      }

      return {
        ...item,
        categories: item.categories || "",
        logoPath: item.logoPath || null,
        logoUrl: logoSignedUrl || item.logoPath || null,
      };
    }));

    res.json(result);
  } catch (err) {
    console.error("Error fetching market items:", err);
    res.status(500).json({ message: "Server error while fetching market items." });
  }
});

// @desc    Get all actions from ActionHistory for Admin view
// @route   GET /api/admin/action-history
// @access  Private (Admin)
router.get("/action-history", protect, async (req, res) => {
  try {
    if (req.user.role.toLowerCase() !== 'admin') {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    let query = `
      SELECT
        ah."HistoryID" as id,
        ah."ActionType" as "actionType",
        ah."TargetID" as "targetId",
        ah."Details" as details,
        ah."CreatedAt" as date,
        u."FullName" as "userName",
        s."CompanyName" as "companyName"
      FROM "ActionHistory" ah
      JOIN "Users" u ON ah."UserID" = u."UserID"
      JOIN "Suppliers" s ON ah."SupplierID" = s."SupplierID"
    `;
    const queryParams = [];
    const { supplierId } = req.query;

    if (supplierId) {
      queryParams.push(supplierId);
      query += ` WHERE ah."SupplierID" = $1`;
    }

    query += ` ORDER BY ah."CreatedAt" DESC LIMIT 200;`;

    const { rows } = await pool.query(query, queryParams);
    res.json(rows);

  } catch (err) {
    console.error("Error fetching action history for admin:", err);
    res.status(500).json({ message: "Server error while fetching action history." });
  }
});

// @desc    Get action history for a specific supplier (for Admin view)
// @route   GET /api/admin/suppliers/:supplierId/history
// @access  Private (Admin)
router.get("/suppliers/:supplierId/history", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const { supplierId } = req.params;

  if (!supplierId || isNaN(parseInt(supplierId))) {
      return res.status(400).json({ message: "A valid Supplier ID is required." });
  }

  try {
    const historyQuery = `
      SELECT
        ah."HistoryID" as "historyId",
        ah."ActionType" as "actionType",
        ah."TargetID" as "targetId",
        ah."Details" as details,
        ah."CreatedAt" as "createdAt",
        u."FullName" as "userName",
        i."Name" as "itemName"
      FROM "ActionHistory" ah
      LEFT JOIN "Users" u ON u."UserID" = ah."UserID"
      LEFT JOIN "Items" i ON ah."TargetID" = i."ItemID"
      WHERE ah."SupplierID" = $1
      ORDER BY ah."CreatedAt" DESC;
    `;

    const { rows } = await pool.query(historyQuery, [supplierId]);
    res.json(rows);

  } catch (err) {
    console.error("Failed to fetch supplier action history:", err);
    res.status(500).json({ message: "Internal server error while fetching history." });
  }
});

// @desc    Download ALL supplier quotations for an announcement
// @route   GET /api/admin/announcements/:id/download-all
// @access  Private (Admin)
router.get("/announcements/:id/download-all", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== "admin") {
    return res.status(403).json({ message: "Admins only" });
  }

  const announcementId = parseInt(req.params.id, 10);
  if (!Number.isInteger(announcementId)) {
    return res.status(400).json({ message: "Invalid announcement id." });
  }

  const attemptNumber = req.query.attemptNumber ? parseInt(req.query.attemptNumber, 10) : null;

  try {
    const params = [announcementId];
    let whereClause = 'sf."FileID" = $1';

    if (Number.isInteger(attemptNumber) && attemptNumber > 0) {
      params.push(attemptNumber);
      whereClause += ` AND COALESCE(sf."CurrentAttemptNumber", 1) = $${params.length}`;
    }

    const query = `
      SELECT
        s."CompanyName",
        latest."ResponseFilePath"
      FROM "SupplierFiles" sf
      JOIN "Suppliers" s ON s."SupplierID" = sf."SupplierID"
      LEFT JOIN LATERAL (
        SELECT
          sr."ResponseFilePath",
          sr."DateUploaded",
          sr."ResponseID"
        FROM "SupplierResponses" sr
        WHERE sr."SupplierFileID" = sf."SupplierFileID"
        ORDER BY sr."DateUploaded" DESC NULLS LAST, sr."ResponseID" DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE ${whereClause} AND latest."ResponseFilePath" IS NOT NULL;
    `;

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ message: "No quotations found." });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=quotations_${announcementId}.zip`
    );

    const archive = archiver("zip");
    archive.pipe(res);

    rows.forEach((row) => {
      const filePath = path.join(__dirname, "..", row.ResponseFilePath);

      if (fs.existsSync(filePath)) {
        archive.file(filePath, {
          name: `${row.CompanyName.replace(/[^a-z0-9]/gi, "_")}.pdf`,
        });
      }
    });

    archive.finalize();
  } catch (err) {
    console.error("ZIP creation error:", err);
    res.status(500).json({ message: "Error generating ZIP" });
  }
});

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private (Admin)
router.get("/stats", protect, async (req, res) => {
  try {
    if (!req.user || req.user.role.toLowerCase() !== "admin") {
      return res.status(403).json({ message: "Admins only" });
    }

    const client = await pool.connect();

    let totalSuppliers = 0;
    let totalProducts = 0;
    let activeAnnouncements = 0;
    let pendingResponses = 0;
    let answeredResponses = 0;
    let totalCategories = 0;
    let pendingAccounts = 0;

    try {
      await client.query("BEGIN");

      const totalSuppliersRes = await client.query(`SELECT COUNT(*) AS count FROM "Suppliers"`);
      totalSuppliers = parseInt(totalSuppliersRes.rows[0].count, 10) || 0;

      const totalProductsRes = await client.query(`SELECT COUNT(*) AS count FROM "Items"`);
      totalProducts = parseInt(totalProductsRes.rows[0].count, 10) || 0;

      const activeAnnouncementsRes = await client.query(`
        SELECT COUNT(*) AS count
        FROM "ProcurementFiles"
        WHERE "Status" = 'ACTIVE' AND "DatePosted" <= NOW()
      `);
      activeAnnouncements = parseInt(activeAnnouncementsRes.rows[0].count, 10) || 0;

      const responsesRes = await client.query(`
        SELECT
          SUM(CASE WHEN UPPER("Status") = 'PENDING' THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN UPPER("Status") = 'ANSWERED' THEN 1 ELSE 0 END) AS answered
        FROM "SupplierFiles"
      `);
      pendingResponses = parseInt(responsesRes.rows[0].pending, 10) || 0;
      answeredResponses = parseInt(responsesRes.rows[0].answered, 10) || 0;

      const totalCategoriesRes = await client.query(`SELECT COUNT(*) AS count FROM "Categories"`);
      totalCategories = parseInt(totalCategoriesRes.rows[0].count, 10) || 0;

      const pendingAccountsRes = await client.query(`SELECT COUNT(*) AS count FROM "Users" WHERE "AccountStatus" = 'PENDING'`);
      pendingAccounts = parseInt(pendingAccountsRes.rows[0].count, 10) || 0;

      await client.query("COMMIT");

      res.json({
        totalSuppliers,
        totalProducts,
        activeAnnouncements,
        pendingResponses,
        answeredResponses,
        totalCategories,
        pendingAccounts
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Stats transaction error:", err);
      res.json({
        totalSuppliers,
        totalProducts,
        activeAnnouncements,
        pendingResponses,
        answeredResponses,
        totalCategories,
        pendingAccounts
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Stats connection error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/announcements/:id/detail", protect, async (req, res) => {
  const fileId = coerceToInt(req.params.id);
  if (!fileId) return res.status(400).json({ message: "Invalid announcement id." });

  try {
    const detailQuery = `
      WITH base AS (
        SELECT pf."FileID", pf."Title", pf."Description", pf."FilePath", pf."DatePosted", pf."EndDate", pf."SendType", pf."Status", pf."CreatedBy",
               u."FullName" AS "CreatedByName", u."Email" AS "CreatedByEmail",
               (pf."EndDate" IS NOT NULL AND pf."EndDate" < NOW()) AS "IsExpired",
               NULL::text AS "FileName"
        FROM "ProcurementFiles" pf
        LEFT JOIN "Users" u ON u."UserID" = pf."CreatedBy"
        WHERE pf."FileID" = $1
      ),
      stats AS (
        SELECT sf."FileID",
               COUNT(*) AS total_suppliers,
               COUNT(*) FILTER (WHERE sf."Status" = 'PENDING') AS pending_count,
               COUNT(*) FILTER (WHERE sf."Status" = 'ANSWERED') AS answered_count,
               0 AS viewed_count,
               COUNT(*) FILTER (WHERE sf."OptInStatus" = 'DECLINED') AS declined_count,
               ARRAY_AGG(DISTINCT sf."SupplierID") AS supplier_ids
        FROM "SupplierFiles" sf
        WHERE sf."FileID" = $1
        GROUP BY sf."FileID"
      ),
      cats AS (
        SELECT pfc."FileID",
               ARRAY_AGG(DISTINCT c."CategoryName") AS names,
               ARRAY_AGG(DISTINCT c."CategoryID") AS ids
        FROM "ProcurementFileCategories" pfc
        JOIN "Categories" c ON c."CategoryID" = pfc."CategoryID"
        WHERE pfc."FileID" = $1
        GROUP BY pfc."FileID"
      ),
      supplier_objs AS (
        SELECT sf."FileID",
               COALESCE(JSON_AGG(DISTINCT jsonb_build_object(
                 'supplierId', s."SupplierID",
                 'name', COALESCE(NULLIF(TRIM(s."CompanyName"), ''), CONCAT('Supplier ', s."SupplierID")),
                 'email', u."Email"
               )) FILTER (WHERE s."SupplierID" IS NOT NULL), '[]'::json) AS supplier_objects
          FROM "SupplierFiles" sf
          JOIN "Suppliers" s ON s."SupplierID" = sf."SupplierID"
          LEFT JOIN "Users" u ON u."SupplierID" = sf."SupplierID"
         WHERE sf."FileID" = $1
         GROUP BY sf."FileID"
      ),
      cat_desc AS (
        WITH RECURSIVE cat_tree AS (
          SELECT pfc."CategoryID"
            FROM "ProcurementFileCategories" pfc
           WHERE pfc."FileID" = $1
          UNION ALL
          SELECT c."CategoryID"
            FROM "Categories" c
            JOIN cat_tree ct ON c."ParentCategoryID" = ct."CategoryID"
        )
        SELECT DISTINCT cat_tree."CategoryID" FROM cat_tree
      ),
      cat_suppliers AS (
        SELECT DISTINCT sc."SupplierID" AS supplier_id,
               s."CompanyName" AS company_name,
               u."Email" AS email
          FROM "SupplierCategories" sc
          JOIN cat_desc cd ON cd."CategoryID" = sc."CategoryID"
          JOIN "Suppliers" s ON s."SupplierID" = sc."SupplierID"
          LEFT JOIN "Users" u ON u."SupplierID" = sc."SupplierID"
      ),
      cat_suppliers_agg AS (
        SELECT COUNT(*) AS total_category_suppliers,
               ARRAY_AGG(DISTINCT company_name) AS company_names,
               ARRAY_AGG(DISTINCT email) FILTER (WHERE email IS NOT NULL) AS emails,
               ARRAY_AGG(DISTINCT supplier_id) AS supplier_ids,
               COALESCE(JSON_AGG(DISTINCT jsonb_build_object(
                 'name', company_name,
                 'email', email,
                 'supplierId', supplier_id
               )) FILTER (WHERE company_name IS NOT NULL), '[]'::json) AS supplier_objects
          FROM cat_suppliers
      )
      SELECT b.*,
             COALESCE(stats.total_suppliers, 0) AS "TotalSuppliersAssigned",
             COALESCE(cat_suppliers_agg.total_category_suppliers, 0) AS "CategorySupplierCount",
             COALESCE(stats.pending_count, 0) AS "PendingCount",
             COALESCE(stats.answered_count, 0) AS "AnsweredCount",
             COALESCE(stats.viewed_count, 0) AS "ViewedCount",
             COALESCE(stats.declined_count, 0) AS "DeclinedCount",
             COALESCE(array_to_string(cats.names, ', '), '') AS "Categories",
             COALESCE(cats.ids, ARRAY[]::int[]) AS "CategoryIDs",
             COALESCE(stats.supplier_ids, ARRAY[]::int[]) AS "SupplierIDs",
             supplier_objs.supplier_objects AS "SupplierObjects",
             COALESCE(cat_suppliers_agg.company_names, ARRAY[]::text[]) AS "CategorySuppliers",
             COALESCE(cat_suppliers_agg.emails, ARRAY[]::text[]) AS "CategorySupplierEmails",
             COALESCE(cat_suppliers_agg.supplier_ids, ARRAY[]::int[]) AS "CategorySupplierIds",
             cat_suppliers_agg.supplier_objects AS "CategorySupplierObjects",
             COALESCE(
               (
                 SELECT ARRAY_AGG(DISTINCT s."CompanyName")
                 FROM "Suppliers" s
                 WHERE s."SupplierID" = ANY(COALESCE(stats.supplier_ids, ARRAY[]::int[]))
               ),
               ARRAY[]::text[]
             ) AS "Suppliers",
             COALESCE(attempts.attempt_count, 1) AS "AttemptNumber",
             attempts.latest_active_at AS "AttemptSentAt",
             attempts.latest_status AS "AttemptStatus",
             COALESCE(response_stats.responder_distinct, 0) AS "DistinctResponderCount",
             COALESCE(response_stats.response_total, 0) AS "RawResponseCount"
      FROM base b
      LEFT JOIN stats ON stats."FileID" = b."FileID"
      LEFT JOIN cats ON cats."FileID" = b."FileID"
        LEFT JOIN supplier_objs ON supplier_objs."FileID" = b."FileID"
       LEFT JOIN cat_suppliers_agg ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(1 + COUNT(*) FILTER (
                      WHERE h."OldStatus" IN ('FAILED_POSTING', 'COMPLETED') AND h."NewStatus" = 'ACTIVE'
                    ), 1) AS attempt_count,
               MAX(CASE WHEN h."NewStatus" = 'ACTIVE' THEN h."ChangedAt" END) AS latest_active_at,
               (
                 SELECT h2."NewStatus" FROM "ProcurementStatusHistory" h2
                 WHERE h2."FileID" = b."FileID"
                 ORDER BY h2."ChangedAt" DESC
                 LIMIT 1
               ) AS latest_status
        FROM "ProcurementStatusHistory" h
        WHERE h."FileID" = b."FileID"
      ) attempts ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS response_total,
               COUNT(DISTINCT sf."SupplierID") AS responder_distinct
        FROM "SupplierFiles" sf
        JOIN "SupplierResponses" sr ON sr."SupplierFileID" = sf."SupplierFileID"
        WHERE sf."FileID" = b."FileID"
      ) response_stats ON TRUE
      LIMIT 1
    `;
    const { rows } = await pool.query(detailQuery, [fileId]);
    if (rows.length === 0) return res.status(404).json({ message: "Announcement not found." });

    const mapped = mapProcurementViewRow(rows[0]);
    console.log('[announcements/:id/detail] supplierObjects count:', Array.isArray(mapped.supplierObjects) ? mapped.supplierObjects.length : 0, 'supplierIds:', mapped.supplierIds);
    return res.json({ announcement: mapped });
  } catch (err) {
    console.error("Error fetching announcement detail:", err);
    return res.status(500).json({ message: "Server error while fetching announcement detail." });
  }
});

// ============================================
// BUYER PURCHASE REQUEST MANAGEMENT ROUTES
// ============================================

// @desc    Get all buyer purchase requests with filtering
// @route   GET /api/admin/buyer-requests
// @access  Private (Admin)
router.get("/buyer-requests", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const { status, search, from, to } = req.query;

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isInteger(limit) || limit <= 0) {
      limit = DEFAULT_PAGE_SIZE;
    }
    limit = Math.min(limit, MAX_PAGE_SIZE);

    let page = parseInt(req.query.page, 10);
    if (!Number.isInteger(page) || page <= 0) {
      page = 1;
    }
    const offset = (page - 1) * limit;

    const params = [];
    const where = [];

    const hasNotesColumn = await hasBuyerUploadsNotesColumn();
    const notesSelect = hasNotesColumn ? 'bu."Notes" as notes,' : 'NULL::text as notes,';

    if (status) {
      params.push(status.toUpperCase());
      where.push(`bu."Status" = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(LOWER(bu."Title") LIKE $${params.length} OR LOWER(bu."Description") LIKE $${params.length} OR LOWER(u."FullName") LIKE $${params.length})`);
    }

    if (from) {
      params.push(from);
      where.push(`bu."DateUploaded"::date >= $${params.length}::date`);
    }

    if (to) {
      params.push(to);
      where.push(`bu."DateUploaded"::date <= $${params.length}::date`);
    }

    const limitParamIndex = params.length + 1;
    const offsetParamIndex = params.length + 2;

    const query = `
      WITH filtered AS (
        SELECT 
          bu."UploadID" as id,
          bu."Title" as title,
          bu."Description" as description,
          ${notesSelect}
          bu."EndDate" as "endDate",
          bu."FilePath" as "filePath",
          bu."Status" as status,
          bu."DateUploaded" as "dateUploaded",
          bu."AdminFeedback" as "adminFeedback",
          u."FullName" as "buyerName",
          u."Email" as "buyerEmail",
          u."UserID" as "buyerId",
          COUNT(*) OVER() AS "TotalCountAll"
        FROM "BuyerUploads" bu
        JOIN "Users" u ON u."UserID" = bu."UserID"
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY bu."DateUploaded" DESC
        LIMIT $${limitParamIndex}
        OFFSET $${offsetParamIndex}
      )
      SELECT * FROM filtered;
    `;

    params.push(limit, offset);

    const { rows } = await pool.query(query, params);
    const totalCount = rows.length > 0 ? Number(rows[0].TotalCountAll || 0) : 0;

    // Generate signed URLs for all items
    const itemsWithUrls = await Promise.all(rows.map(async (item) => {
      if (item.filePath) {
        try {
          item.fileUrl = await generateSignedUrl(item.filePath, 60);
        } catch (error) {
          console.error('Error generating signed URL for item:', item.id, error);
          item.fileUrl = null;
        }
      }
      return item;
    }));

    res.json({
      items: itemsWithUrls,
      total: totalCount,
      page,
      limit
    });
  } catch (err) {
    console.error("Error fetching buyer requests:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get single buyer purchase request details with SAS URL
// @route   GET /api/admin/buyer-requests/:id
// @access  Private (Admin)
router.get("/buyer-requests/:id", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const uploadId = parseInt(req.params.id, 10);
  if (!uploadId || isNaN(uploadId)) {
    return res.status(400).json({ message: "Invalid request ID." });
  }

  try {
    const hasNotesColumn = await hasBuyerUploadsNotesColumn();
    const notesSelect = hasNotesColumn ? 'bu."Notes" as notes,' : 'NULL::text as notes,';

    const query = `
      SELECT 
        bu."UploadID" as id,
        bu."Title" as title,
        bu."Description" as description,
        ${notesSelect}
        bu."EndDate" as "endDate",
        bu."FilePath" as "filePath",
        bu."Status" as status,
        bu."DateUploaded" as "dateUploaded",
        bu."AdminFeedback" as "adminFeedback",
        u."FullName" as "buyerName",
        u."Email" as "buyerEmail",
        u."UserID" as "buyerId"
      FROM "BuyerUploads" bu
      JOIN "Users" u ON u."UserID" = bu."UserID"
      WHERE bu."UploadID" = $1
    `;

    const { rows } = await pool.query(query, [uploadId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: "Request not found." });
    }

    const result = rows[0];
    
    // Generate signed URL for the PDF (60 minutes expiry)
    if (result.filePath) {
      try {
        result.fileUrl = await generateSignedUrl(result.filePath, 60);
      } catch (error) {
        console.error('Error generating signed URL:', error);
        result.fileUrl = null;
      }
    }

    res.json(result);
  } catch (err) {
    console.error("Error fetching buyer request details:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Download buyer request PDF file
// @route   GET /api/admin/buyer-requests/:id/file
// @access  Private (Admin)
router.get("/buyer-requests/:id/file", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const uploadId = parseInt(req.params.id, 10);

  try {
    const { rows } = await pool.query(
      'SELECT "FilePath", "Title" FROM "BuyerUploads" WHERE "UploadID" = $1',
      [uploadId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Request not found." });
    }

    const filePath = rows[0].FilePath; // e.g., "buyer-pr/announcements/filename.pdf"
    const title = rows[0].Title;

    // Download from Supabase
    const stream = await downloadFile(filePath);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${title}.pdf"`);
    
    stream.pipe(res);
  } catch (err) {
    console.error("Error downloading file:", err);
    
    if (err.message.includes('not found')) {
      return res.status(404).json({ message: "File not found in storage" });
    }
    
    res.status(500).json({ message: "Error downloading file" });
  }
});

// @desc    Update buyer purchase request status and feedback
// @route   PATCH /api/admin/buyer-requests/:id/status
// @access  Private (Admin)
router.patch("/buyer-requests/:id/status", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  const uploadId = parseInt(req.params.id, 10);
  const { status, feedback } = req.body;

  const allowedStatuses = ['PENDING', 'REVIEWED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'];
  
  if (!status || !allowedStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({ 
      message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}` 
    });
  }

  try {
    const updateQuery = `
        UPDATE "BuyerUploads"
        SET "Status" = $1, 
            "AdminFeedback" = $2
        WHERE "UploadID" = $3
        RETURNING 
          "UploadID" as id,
          "UserID" as "userId",
          "Title" as title,
          "Status" as status,
          "AdminFeedback" as "adminFeedback",
          "DateUploaded" as "dateUploaded"
      `;
    
    const { rows } = await pool.query(updateQuery, [
      status.toUpperCase(), 
      feedback || null, 
      uploadId
    ]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Record history: status change and optional feedback
    try {
      const updated = rows[0];
      const adminId = req.user.UserID || req.user.userID || req.user.id || 'admin';
      const adminName = req.user.FullName || req.user.fullName || req.user.name || req.user.email || '';
      const adminRole = req.user.role || 'admin';

      // Keep Action concise; put actor info & feedback into Details for richer audit
      const statusAction = `Status updated to ${String(updated.status).toUpperCase()}`;
      let details = `By: ${adminName || 'Admin'}`;
      if (feedback) {
        details += `\nFeedback: ${feedback}`;
      }

      // Use helper from BuyerRoutes; it's resilient and logs errors internally
      if (typeof buyerRoutes.addPurchaseRequestHistory === 'function') {
        await buyerRoutes.addPurchaseRequestHistory(uploadId, statusAction, details);
      }
    } catch (histErr) {
      console.warn('[adminRoutes.js] Failed to write purchase request history:', histErr && histErr.message);
    }

    // Notify the buyer about the status change (fire-and-forget)
    notifyBuyerPurchaseStatus(uploadId, status, feedback).catch((err) => {
      console.warn('[adminRoutes] Failed to send buyer PR status email:', err && err.message ? err.message : err);
    });

    // Create in-app notification for the buyer (fire-and-forget)
    const buyerUserId = rows[0]?.userId;
    if (buyerUserId) {
      notificationService.createNotification({
        userId: buyerUserId,
        type: "buyer_request_status",
        title: "Purchase request update",
        body: `${rows[0].title || 'Your request'} is now ${status.toUpperCase()}.`,
        metadata: { uploadId, status: status.toUpperCase(), feedback: feedback || null },
      }).catch((err) => {
        console.warn('[adminRoutes] Failed to create buyer notification:', err && err.message ? err.message : err);
      });
    }

    res.json({ 
      message: 'Status updated successfully', 
      request: rows[0] 
    });
  } catch (err) {
    console.error("Error updating buyer request:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get buyer request statistics
// @route   GET /api/admin/buyer-requests/stats/summary
// @access  Private (Admin)
router.get("/buyer-requests/stats/summary", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const query = `
      SELECT
        COUNT(*) FILTER (WHERE "Status" = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE "Status" = 'REVIEWED') as reviewed,
        COUNT(*) FILTER (WHERE "Status" = 'IN_PROGRESS') as "inProgress",
        COUNT(*) FILTER (WHERE "Status" = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE "Status" = 'REJECTED') as rejected,
        COUNT(*) as total
      FROM "BuyerUploads"
    `;

    const { rows } = await pool.query(query);
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching buyer request stats:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;