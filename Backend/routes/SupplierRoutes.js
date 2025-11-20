const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');

// configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });
const { protect } = require("./authMiddleware");
const pool = require("../db.js");

// @desc    Get assigned procurement files for a logged-in supplier
// @route   GET /api/supplier-files
// @access  Private
router.get("/", protect, async (req, res) => {
  console.log("[SupplierRoutes.js] GET / route hit.");
  const loggedInUserId = req.user.userID; // From JWT payload via 'protect' middleware

  try {
    // Find the SupplierID linked to the UserID
    const userResult = await pool.query(
      'SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1',
      [loggedInUserId]
    );

    const supplierId = userResult.rows[0]?.SupplierID;

    if (!supplierId) {
      console.log("[SupplierRoutes.js] SupplierID not found for UserID:", loggedInUserId);
      return res.status(404).json({ message: "Supplier profile not found for this user." });
    }

    // Query to get all files assigned to this supplier by joining the tables
    const filesQuery = `
      SELECT 
        sf."SupplierFileID", 
        sf."Status", 
        sf."DateSent" as "dateSent", 
        pf."FileID", 
        pf."Title", 
        pf."Description", 
        pf."FilePath" as "filePath",
        pf."DatePosted" as "datePosted",
        pf."EndDate" as "endDate"
      FROM "SupplierFiles" sf
      JOIN "ProcurementFiles" pf ON sf."FileID" = pf."FileID"
      WHERE sf."SupplierID" = $1
      ORDER BY sf."DateSent" DESC;
    `;
    const assignedFiles = await pool.query(filesQuery, [supplierId]);
    res.json(assignedFiles.rows);
    console.log("[SupplierRoutes.js] Successfully fetched assigned files.");
  } catch (err) {
    console.error("Error fetching supplier files:", err.message);
    res.status(500).json({ message: "Server error while fetching files." });
  }
});

// ---- Add upload endpoint at bottom ----
router.post('/uploads', protect, upload.single('file'), async (req, res) => {
  console.log('[SupplierRoutes] POST /uploads hit');
  try {
    // Ensure user is a supplier
    if (!req.user || !req.user.role || req.user.role.toLowerCase() !== 'supplier') {
      return res.status(403).json({ message: 'Only suppliers may upload product files' });
    }

    // Find SupplierID for this user
    const userId = req.user.userID;
    const userQ = await pool.query('SELECT "SupplierID" FROM "Users" WHERE "UserID" = $1', [userId]);
    const supplierId = userQ.rows[0]?.SupplierID;
    if (!supplierId) return res.status(404).json({ message: 'Supplier profile not found' });

    if (!req.file) return res.status(400).json({ message: 'File is required' });

    const filePath = req.file.path;
    const fileName = req.file.originalname;

    // Insert upload record
    const insertQ = `INSERT INTO "SupplierUploads" ("SupplierID","FilePath","FileName","Status") VALUES ($1,$2,$3,'PENDING') RETURNING "UploadID","CreatedAt"`;
    const { rows } = await pool.query(insertQ, [supplierId, filePath, fileName]);
    const uploadId = rows[0].UploadID;

    // TODO: kick off background processing to parse CSV/Excel and upsert Items

    res.status(201).json({ message: 'File uploaded', uploadId, createdAt: rows[0].CreatedAt });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Server error while uploading file', error: err.message });
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

    const { name, description, price, stock, unit, location, categories } = req.body;
    if (!name || !unit) return res.status(400).json({ message: 'Missing required fields: name or unit' });

    // Insert into Items
    const insertQ = `
      INSERT INTO "Items" ("SupplierID","Name","Description","Price","Stock","Unit","Location")
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING "ItemID";
    `;
    const vals = [supplierId, name, description || null, price || 0, stock || 0, unit, location || null];
    const { rows } = await pool.query(insertQ, vals);
    const newItemId = rows[0].ItemID;

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
    const searchQ = `%${q.trim().toLowerCase()}%`;
    const query = `
      SELECT "ItemID", "Name", "Description", "Price", "Stock", "Unit", "Location", "DatePosted"
      FROM "Items"
      WHERE "SupplierID" = $1 AND LOWER("Name") LIKE $2
      ORDER BY "DatePosted" DESC
      LIMIT 50;
    `;
    const { rows } = await pool.query(query, [supplierId, searchQ]);
    res.json(rows);
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

module.exports = router;
