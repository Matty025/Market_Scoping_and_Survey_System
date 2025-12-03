const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { protect } = require("./authMiddleware");
const pool = require("../db.js");
const archiver = require("archiver");
const fs = require("fs");

const FALLBACK_CATEGORY_NAME = "Uncategorized";

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
  "CLOSED",
  "AWARDED",
  "CANCELLED",
  "EXPIRED"
]);

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
    awardedSupplierId: row.AwardedSupplierID,
    awardedSupplierName: row.AwardedSupplierName,
    awardedAt: row.AwardedAt,
    isExpired: Boolean(row.IsExpired),
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
          COALESCE(attempts.attempt_count, 1) AS "AttemptNumber",
          attempts.latest_active_at AS "AttemptSentAt",
          attempts.latest_status AS "AttemptStatus",
          COALESCE(response_stats.responder_distinct, 0) AS "DistinctResponderCount",
          COALESCE(response_stats.response_total, 0) AS "RawResponseCount",
          COUNT(*) OVER() AS "TotalCountAll"
        FROM "ProcurementFilesWithDetails" AS pf
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE h."NewStatus" = 'ACTIVE') AS attempt_count,
            MAX(CASE WHEN h."NewStatus" = 'ACTIVE' THEN h."ChangedAt" END) AS latest_active_at,
            (
              SELECT h2."NewStatus"
              FROM "ProcurementStatusHistory" h2
              WHERE h2."FileID" = pf."FileID"
              ORDER BY h2."ChangedAt" DESC
              LIMIT 1
            ) AS latest_status
          FROM "ProcurementStatusHistory" h
          WHERE h."FileID" = pf."FileID"
        ) AS attempts ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS response_total,
            COUNT(DISTINCT sf."SupplierID") AS responder_distinct
          FROM "SupplierFiles" sf
          JOIN "SupplierResponses" sr ON sr."SupplierFileID" = sf."SupplierFileID"
          WHERE sf."FileID" = pf."FileID"
        ) AS response_stats ON TRUE
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY pf."DatePosted" DESC, pf."FileID" DESC
        LIMIT $${limitParamIndex}
        OFFSET $${offsetParamIndex}
      )
      SELECT * FROM filtered;
    `;

    params.push(limit, offset);

    const { rows } = await pool.query(baseQuery, params);
    const totalCount = rows.length > 0 ? Number(rows[0].TotalCountAll || 0) : 0;

    const mappedRows = rows.map(mapProcurementViewRow);

    res.json({
      items: mappedRows,
      total: totalCount,
      page,
      limit
    });
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

  const { title, description, categoryId, end, sendType } = req.body;
  const suppliers = parseJsonArray(req.body.suppliers);
  const targetCategories = parseJsonArray(req.body.categories);
  const normalizedSendType = String(sendType || 'category').toLowerCase() === 'supplier' ? 'supplier' : 'category';
  const createdByUserId = coerceToInt(req.user?.userID || req.user?.id);

  const filePath = req.file ? req.file.path : null;

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
          "DeclinedAt" = NULL,
          "ReuseResponseID" = NULL,
          "LastReusedAt" = NULL;
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
    const filePathToSet = req.file ? req.file.path : existing.FilePath;
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
           "DeclinedAt" = NULL,
           "ReuseResponseID" = NULL,
           "LastReusedAt" = NULL`,
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

    const { rows: detailRows } = await pool.query(
      `SELECT pf.*, COALESCE(attempts.attempt_count, 1) AS "AttemptNumber",
              attempts.latest_active_at AS "AttemptSentAt",
              attempts.latest_status AS "AttemptStatus"
       FROM "ProcurementFilesWithDetails" AS pf
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE h."NewStatus" = 'ACTIVE') AS attempt_count,
                MAX(CASE WHEN h."NewStatus" = 'ACTIVE' THEN h."ChangedAt" END) AS latest_active_at,
                (
                  SELECT h2."NewStatus"
                  FROM "ProcurementStatusHistory" h2
                  WHERE h2."FileID" = pf."FileID"
                  ORDER BY h2."ChangedAt" DESC
                  LIMIT 1
                ) AS latest_status
         FROM "ProcurementStatusHistory" h
         WHERE h."FileID" = pf."FileID"
       ) AS attempts ON TRUE
       WHERE pf."FileID" = $1`,
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

  const requestedStatus = typeof req.body.status === 'string' ? req.body.status.trim().toUpperCase() : '';
  const rawNotes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
  const notes = rawNotes.length > 0 ? rawNotes : null;
  const awardedSupplierId = coerceToInt(req.body.awardedSupplierId);

  if (!VALID_ANNOUNCEMENT_STATUSES.has(requestedStatus)) {
    return res.status(400).json({ message: `Invalid status. Allowed values: ${Array.from(VALID_ANNOUNCEMENT_STATUSES).join(', ')}` });
  }

  if ((requestedStatus === 'CANCELLED' || requestedStatus === 'CLOSED' || requestedStatus === 'AWARDED') && !notes) {
    return res.status(400).json({ message: "Please provide notes explaining this status change." });
  }

  if (requestedStatus === 'AWARDED' && !awardedSupplierId) {
    return res.status(400).json({ message: "Please select the supplier that won this announcement." });
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

    let awardedSupplierName = null;

    const needsWinner = (requestedStatus === 'AWARDED') || (requestedStatus === 'CLOSED' && awardedSupplierId);
    if (needsWinner) {
      const supplierRes = await client.query(
        `SELECT "SupplierID",
                COALESCE(
                  NULLIF(TRIM("CompanyName"), ''),
                  NULLIF(TRIM("SupplierName"), ''),
                  NULLIF(TRIM("ContactPerson"), ''),
                  NULLIF(TRIM(CONCAT(COALESCE("FirstName", ''), ' ', COALESCE("LastName", ''))), '')
                ) AS "DisplayName"
         FROM "Suppliers"
         WHERE "SupplierID" = $1`,
        [awardedSupplierId]
      );

      if (supplierRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Awarded supplier not found." });
      }

      const assignmentCheck = await client.query(
        'SELECT 1 FROM "SupplierFiles" WHERE "FileID" = $1 AND "SupplierID" = $2 LIMIT 1',
        [fileId, awardedSupplierId]
      );

      if (assignmentCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Selected supplier is not part of this announcement." });
      }

      awardedSupplierName = supplierRes.rows[0].DisplayName || `Supplier ${awardedSupplierId}`;

      await client.query(
        `UPDATE "ProcurementFiles"
         SET "AwardedSupplierID" = $1,
             "AwardedAt" = NOW()
         WHERE "FileID" = $2`,
        [awardedSupplierId, fileId]
      );

      await client.query(
        `UPDATE "SupplierFiles"
         SET "Status" = $1
         WHERE "FileID" = $2 AND "SupplierID" = $3`,
        ['AWARDED', fileId, awardedSupplierId]
      );
    } else if (requestedStatus === 'CANCELLED') {
      await client.query(
        `UPDATE "ProcurementFiles"
         SET "AwardedSupplierID" = NULL,
             "AwardedAt" = NULL
         WHERE "FileID" = $1`,
        [fileId]
      );
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
    res.json({
      message: "Announcement status updated.",
      fileId,
      previousStatus,
      status: requestedStatus,
      awardedSupplierId: awardedSupplierId || null,
      awardedSupplierName: awardedSupplierName
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

  const fileId = coerceToInt(req.params.id);
  const supplierId = coerceToInt(req.body.supplierId);
  const notes = typeof req.body.notes === 'string' ? req.body.notes : `Awarded to supplier ${supplierId}`;

  if (!fileId || !supplierId) {
    return res.status(400).json({ message: "Valid announcement id and supplier id are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const fileRes = await client.query(
      'SELECT "Status" FROM "ProcurementFiles" WHERE "FileID" = $1',
      [fileId]
    );

    if (fileRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Announcement not found." });
    }

    const assignmentRes = await client.query(
      'SELECT "SupplierFileID" FROM "SupplierFiles" WHERE "FileID" = $1 AND "SupplierID" = $2',
      [fileId, supplierId]
    );

    if (assignmentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Supplier is not assigned to this announcement." });
    }

    await client.query(
      `UPDATE "ProcurementFiles"
       SET "Status" = $1, "AwardedSupplierID" = $2, "AwardedAt" = NOW()
       WHERE "FileID" = $3`,
      ['AWARDED', supplierId, fileId]
    );

    await client.query(
      `UPDATE "SupplierFiles"
       SET "Status" = $1
       WHERE "FileID" = $2 AND "SupplierID" = $3`,
      ['AWARDED', fileId, supplierId]
    );

    await recordStatusHistory(client, {
      fileId,
      oldStatus: fileRes.rows[0].Status || null,
      newStatus: 'AWARDED',
      changedBy: coerceToInt(req.user?.userID || req.user?.id),
      notes
    });

    await client.query("COMMIT");
    res.json({
      message: "Announcement awarded successfully.",
      fileId,
      supplierId,
      status: 'AWARDED'
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Error awarding announcement:", err);
    res.status(500).json({ message: "Server error while awarding announcement.", error: err.message });
  } finally {
    client.release();
  }
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
    res.json(rows);
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
  const { status } = req.body;
  if (!userId || !status) return res.status(400).json({ message: 'Missing user id or status' });

  const allowed = ['PENDING','APPROVED','REJECTED','BLACKLISTED'];
  const normalized = String(status).toUpperCase();
  if (!allowed.includes(normalized)) return res.status(400).json({ message: 'Invalid status' });

  try {
    const updateQ = `UPDATE "Users" SET "AccountStatus" = $1 WHERE "UserID" = $2 RETURNING "UserID","FullName","Email","AccountStatus"`;
    const { rows } = await pool.query(updateQ, [normalized, userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User status updated', user: rows[0] });
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
        sf."LastReusedAt"         AS "lastReusedAt",
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
        STRING_AGG(c."CategoryName", ', ') AS categories
      FROM "Items" i
      JOIN "Suppliers" s ON i."SupplierID" = s."SupplierID"
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

    const result = rows.map((item) => ({
      ...item,
      categories: item.categories || "",
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
            SELECT pf.*,
              COALESCE(attempts.attempt_count, 1) AS "AttemptNumber",
              attempts.latest_active_at AS "AttemptSentAt",
              attempts.latest_status AS "AttemptStatus",
              COALESCE(response_stats.responder_distinct, 0) AS "DistinctResponderCount",
              COALESCE(response_stats.response_total, 0) AS "RawResponseCount"
      FROM "ProcurementFilesWithDetails" pf
      LEFT JOIN LATERAL (
        SELECT COUNT(*) FILTER (WHERE h."NewStatus" = 'ACTIVE') AS attempt_count,
               MAX(CASE WHEN h."NewStatus" = 'ACTIVE' THEN h."ChangedAt" END) AS latest_active_at,
               (
                 SELECT h2."NewStatus" FROM "ProcurementStatusHistory" h2
                 WHERE h2."FileID" = pf."FileID"
                 ORDER BY h2."ChangedAt" DESC
                 LIMIT 1
               ) AS latest_status
        FROM "ProcurementStatusHistory" h
        WHERE h."FileID" = pf."FileID"
      ) attempts ON TRUE
            LEFT JOIN LATERAL (
         SELECT COUNT(*) AS response_total,
           COUNT(DISTINCT sf."SupplierID") AS responder_distinct
         FROM "SupplierFiles" sf
         JOIN "SupplierResponses" sr ON sr."SupplierFileID" = sf."SupplierFileID"
         WHERE sf."FileID" = pf."FileID"
            ) response_stats ON TRUE
      WHERE pf."FileID" = $1
      LIMIT 1
    `;
    const { rows } = await pool.query(detailQuery, [fileId]);
    if (rows.length === 0) return res.status(404).json({ message: "Announcement not found." });
    return res.json({ announcement: mapProcurementViewRow(rows[0]) });
  } catch (err) {
    console.error("Error fetching announcement detail:", err);
    return res.status(500).json({ message: "Server error while fetching announcement detail." });
  }
});

module.exports = router;