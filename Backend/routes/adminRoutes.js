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
    const { search, categoryId, from, to, supplierName, supplierId } = req.query;

    let limit = parseInt(req.query.limit, 10);
    if (Number.isNaN(limit) || limit <= 0) {
      limit = 50;
    }
    limit = Math.min(limit, 100);

    let page = parseInt(req.query.page, 10);
    if (Number.isNaN(page) || page <= 0) {
      page = 1;
    }
    const offset = (page - 1) * limit;

    const params = [];
    const where = [];

    // Text search over Title/Description
    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      where.push(`(LOWER(pf."Title") LIKE $${params.length} OR LOWER(pf."Description") LIKE $${params.length})`);
    }

    // Date range on DatePosted
    if (from) {
      params.push(from);
      where.push(`pf."DatePosted"::date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      where.push(`pf."DatePosted"::date <= $${params.length}::date`);
    }

    // Category filter
    if (categoryId) {
      params.push(parseInt(categoryId, 10));
      where.push(`pf."FileID" IN (
        SELECT pfc."FileID" FROM "ProcurementFileCategories" pfc WHERE pfc."CategoryID" = $${params.length}
      )`);
    }

    // Supplier filter (by id preferred, fallback to name with case/space insensitivity)
    if (supplierId) {
      const sid = parseInt(supplierId, 10);
      if (!Number.isNaN(sid)) {
        params.push(sid);
        where.push(`pf."FileID" IN (
          SELECT DISTINCT sf."FileID"
          FROM "SupplierFiles" sf
          WHERE sf."SupplierID" = $${params.length}
        )`);
      }
    } else if (supplierName && supplierName !== 'All') {
      params.push(String(supplierName));
      where.push(`pf."FileID" IN (
        SELECT DISTINCT sf."FileID" 
        FROM "SupplierFiles" sf
        JOIN "Suppliers" s ON sf."SupplierID" = s."SupplierID"
        WHERE TRIM(LOWER(s."CompanyName")) = TRIM(LOWER($${params.length}))
      )`);
    }

    let baseQuery = `
      SELECT
        pf."FileID" as id,
        pf."Title" as title,
        pf."Description" as description,
        pf."FilePath" as "filePath",
        pf."DatePosted" as posted,
        pf."EndDate" as end,
        pf."SendType" as "sendType",
        CASE WHEN pf."EndDate" IS NOT NULL AND pf."EndDate" < NOW() THEN TRUE ELSE FALSE END AS "isExpired",
        COALESCE(string_agg(DISTINCT c."CategoryName", ', ' ORDER BY c."CategoryName"), '') as categories,
        COALESCE(array_agg(DISTINCT s2."CompanyName") FILTER (WHERE s2."CompanyName" IS NOT NULL), ARRAY[]::text[]) as suppliers,
        COUNT(DISTINCT sr."ResponseID") AS "responseCount",
        COUNT(*) OVER() AS "totalCount"
      FROM "ProcurementFiles" pf
      LEFT JOIN "ProcurementFileCategories" pfc ON pfc."FileID" = pf."FileID"
      LEFT JOIN "Categories" c ON c."CategoryID" = pfc."CategoryID"
      LEFT JOIN "SupplierFiles" sf ON sf."FileID" = pf."FileID"
      LEFT JOIN "SupplierResponses" sr ON sr."SupplierFileID" = sf."SupplierFileID"
      LEFT JOIN "Suppliers" s2 ON s2."SupplierID" = sf."SupplierID"
    `;

    if (where.length > 0) {
      baseQuery += ` WHERE ${where.join(' AND ')}`;
    }

    const limitParamIndex = params.length + 1;
    const offsetParamIndex = params.length + 2;

    baseQuery += `
      GROUP BY pf."FileID"
      ORDER BY pf."DatePosted" DESC
      LIMIT $${limitParamIndex}
      OFFSET $${offsetParamIndex}
    `;

    params.push(limit, offset);

    const { rows } = await pool.query(baseQuery, params);

    const totalCountRaw = rows.length > 0 ? (rows[0].totalCount ?? rows[0].totalcount ?? 0) : 0;
    const totalCount = parseInt(totalCountRaw, 10) || 0;

    const normalizedRows = rows.map((row) => {
      const { totalCount: _tc, totalcount: _tcLower, ...rest } = row;
      return {
        ...rest,
        categories: rest.categories || '',
        sendType: rest.sendType || null,
        suppliers: Array.isArray(rest.suppliers) ? rest.suppliers : []
      };
    });

    res.json({
      items: normalizedRows,
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
  const suppliers = req.body.suppliers ? JSON.parse(req.body.suppliers) : [];
  const targetCategories = req.body.categories ? JSON.parse(req.body.categories) : [];

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

    // Insert into ProcurementFiles with SendType
    const procurementFileQuery = `
      INSERT INTO "ProcurementFiles" ("Title", "Description", "FilePath", "EndDate", "SendType", "DatePosted")
      VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING "FileID";
    `;
    const procurementResult = await client.query(procurementFileQuery, [
      title, 
      description, 
      filePath, 
      end || null,
      sendType || 'category'
    ]);
    const newFileId = procurementResult.rows[0].FileID;

    // Determine which suppliers to notify
    let supplierIdsToNotify = [];
    if (targetCategories && targetCategories.length > 0) {
      const findSuppliersQuery = `
        SELECT "SupplierID" FROM "SupplierCategories"
        WHERE "CategoryID" = ANY($1::int[]);
      `;
      const { rows } = await client.query(findSuppliersQuery, [targetCategories]);
      supplierIdsToNotify = rows.map(r => r.SupplierID);
    } else if (suppliers && suppliers.length > 0) {
      supplierIdsToNotify = suppliers.filter(id => id !== 'all');
    }

    supplierIdsToNotify = supplierIdsToNotify.map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n));
    supplierIdsToNotify = Array.from(new Set(supplierIdsToNotify));
    console.log(`[Announcements] Unique supplier IDs to notify: ${supplierIdsToNotify.length}`);

    // Link file to categories
    if (targetCategories && Array.isArray(targetCategories) && targetCategories.length > 0) {
      const categoryIds = targetCategories.map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n));
      if (categoryIds.length > 0) {
        const insertFileCategoriesQuery = `
          INSERT INTO "ProcurementFileCategories" ("FileID", "CategoryID")
          SELECT $1::int, t.category_id
          FROM UNNEST($2::int[]) AS t(category_id)
          ON CONFLICT DO NOTHING;
        `;
        await client.query(insertFileCategoriesQuery, [newFileId, categoryIds]);
        console.log(`[Announcements] Linked file ${newFileId} to ${categoryIds.length} categories.`);
      }
    }

    // Insert into SupplierFiles
    if (supplierIdsToNotify.length > 0) {
      const supplierFileInsertQuery = `
        INSERT INTO "SupplierFiles" ("SupplierID", "FileID", "Status")
        SELECT DISTINCT t.supplier_id, $1::int, 'PENDING'
        FROM UNNEST($2::int[]) AS t(supplier_id)
        ON CONFLICT ("SupplierID", "FileID") DO NOTHING;
      `;
      await client.query(supplierFileInsertQuery, [newFileId, supplierIdsToNotify]);
      console.log(`[Announcements] Sent announcement ${newFileId} to ${supplierIdsToNotify.length} suppliers.`);
    } else {
      console.log(`[Announcements] Announcement ${newFileId} created but not sent to any specific suppliers.`);
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Announcement posted successfully!", fileId: newFileId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error posting announcement:", err);
    res.status(500).json({ message: "Server error while posting announcement.", error: err.message });
  } finally {
    client.release();
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
        i."DateUpdated" AS date,
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
      GROUP BY i."ItemID", s."CompanyName", i."EffectiveUntil"
      ORDER BY i."DateUpdated" DESC
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

  const announcementId = req.params.id;

  try {
    const query = `
      SELECT
        s."CompanyName",
        sr."ResponseFilePath"
      FROM "SupplierResponses" sr
      JOIN "SupplierFiles" sf ON sr."SupplierFileID" = sf."SupplierFileID"
      JOIN "Suppliers" s ON sf."SupplierID" = s."SupplierID"
      WHERE sf."FileID" = $1;
    `;
    const { rows } = await pool.query(query, [announcementId]);

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
        SELECT COUNT(*) AS count FROM "ProcurementFiles" WHERE "DatePosted" <= NOW()
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

module.exports = router;