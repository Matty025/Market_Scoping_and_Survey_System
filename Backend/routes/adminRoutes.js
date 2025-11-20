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
  const targetCategories = req.body.categories ? JSON.parse(req.body.categories) : [];

  const filePath = req.file ? req.file.path : null;

  console.log(`[Announcements POST] user=${req.user?.userID} role=${req.user?.role}`);
  console.log(`[Announcements POST] title=${title} categoryId=${categoryId} end=${end}`);
  console.log(`[Announcements POST] suppliers(raw)=${req.body.suppliers} parsed=${JSON.stringify(suppliers)}`);
  console.log(`[Announcements POST] categories(raw)=${req.body.categories} parsed=${JSON.stringify(targetCategories)}`);
  console.log(`[Announcements POST] file=${req.file ? req.file.filename : 'none'}`);

  if (!title || !description || !filePath) {
    return res.status(400).json({ message: "Title, description, and file are required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Insert into ProcurementFiles (omit CategoryID if table doesn't have that column)
    // Some DB schemas for ProcurementFiles do not include a CategoryID column — insert only the known columns.
    const procurementFileQuery = `
      INSERT INTO "ProcurementFiles" ("Title", "Description", "FilePath", "EndDate")
      VALUES ($1, $2, $3, $4) RETURNING "FileID";
    `;
    const procurementResult = await client.query(procurementFileQuery, [title, description, filePath, end || null]);
    const newFileId = procurementResult.rows[0].FileID;

    // 2. Determine which suppliers to notify
    let supplierIdsToNotify = [];
    if (targetCategories && targetCategories.length > 0) {
      // Find suppliers based on the categories of items they offer
      // UPDATED: Now uses the new, more direct SupplierCategories table.
      const findSuppliersQuery = `
        SELECT "SupplierID" FROM "SupplierCategories"
        WHERE "CategoryID" = ANY($1::int[]);
      `;
      const { rows } = await client.query(findSuppliersQuery, [targetCategories]);
      supplierIdsToNotify = rows.map(r => r.SupplierID);
    } else if (suppliers && suppliers.length > 0) {
      // Use the manually selected list of suppliers
      supplierIdsToNotify = suppliers.filter(id => id !== 'all');
    }

    // Ensure supplier IDs are integers (Postgres expects int[])
    supplierIdsToNotify = supplierIdsToNotify.map(id => parseInt(id, 10)).filter(n => !Number.isNaN(n));
    // Remove duplicates so a supplier only receives one SupplierFiles row
    supplierIdsToNotify = Array.from(new Set(supplierIdsToNotify));
    console.log(`[Announcements] Unique supplier IDs to notify: ${supplierIdsToNotify.length}`);

    // 2a. Link the created procurement file to selected categories (if any)
    if (targetCategories && Array.isArray(targetCategories) && targetCategories.length > 0) {
      // Ensure category IDs are integers
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

    // 3. Insert into SupplierFiles for each targeted supplier
    if (supplierIdsToNotify.length > 0) {
      // Use DISTINCT in the SELECT so duplicate supplier IDs in the provided array
      // don't cause a conflict between rows of the same INSERT statement.
      const supplierFileInsertQuery = `
        INSERT INTO "SupplierFiles" ("SupplierID", "FileID", "Status")
        SELECT DISTINCT t.supplier_id, $1::int, 'PENDING'
        FROM UNNEST($2::int[]) AS t(supplier_id)
        ON CONFLICT ("SupplierID", "FileID") DO NOTHING;
      `;
      // Use a single query to insert all rows at once for efficiency
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
    const result = await pool.query(
      'SELECT "CategoryID", "CategoryName", "ParentCategoryID" FROM "Categories" ORDER BY "ParentCategoryID" ASC, "CategoryName" ASC'
    );

    // Build the hierarchical structure
    const categories = [];
    const categoryMap = {};

    result.rows.forEach(row => {
      categoryMap[row.CategoryID] = { ...row, children: [] };
    });

    result.rows.forEach(row => {
      if (row.ParentCategoryID) {
        categoryMap[row.ParentCategoryID]?.children.push(categoryMap[row.CategoryID]);
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

module.exports = router;