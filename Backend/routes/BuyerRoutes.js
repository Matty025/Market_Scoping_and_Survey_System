const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { protect } = require('./authMiddleware');
const fs = require('fs');

// Optional: aws-sdk + multer-s3. If not installed, we'll fall back to local disk storage.
let aws;
let multerS3;
try {
  aws = require('aws-sdk');
  multerS3 = require('multer-s3');
} catch (e) {
  console.warn('[BuyerRoutes.js] Optional package missing: aws-sdk or multer-s3 not installed. Falling back to local disk uploads.');
}

// Configure storage: prefer DigitalOcean Spaces via aws-sdk + multer-s3 when available,
// otherwise fall back to local disk storage under uploads/buyer-pr
let storage;
if (aws && multerS3) {
  try {
    const spacesEndpoint = new aws.Endpoint(process.env.DO_SPACES_ENDPOINT);
    const s3 = new aws.S3({
      endpoint: spacesEndpoint,
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
    });

    storage = multerS3({
      s3: s3,
      bucket: process.env.DO_SPACES_BUCKET,
      acl: 'public-read', // Make files publicly readable
      key: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const filePath = `buyer-pr/${uniqueSuffix}-${file.originalname}`;
        cb(null, filePath);
      },
    });
  } catch (e) {
    console.warn('[BuyerRoutes.js] Failed to initialize S3 storage, falling back to disk storage.', e.message || e);
  }
}

if (!storage) {
  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'buyer-pr');
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (e) {
    // ignore
  }

  storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${uniqueSuffix}-${safeName}`);
    },
  });
}

const fileFilter = (req, file, cb) => {
  // We only want to accept PDF files
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    // Reject the file and pass an error
    cb(new Error('Only PDF files are allowed!'), false);
  }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// Helper: add a history entry for a purchase request
async function addPurchaseRequestHistory(uploadId, action, details) {
  try {
    const q = `INSERT INTO "PurchaseRequestHistory" ("UploadID", "Action", "Details") VALUES ($1, $2, $3) RETURNING *`;
    const vals = [uploadId, action, details || null];
    const res = await db.query(q, vals);
    return res.rows[0];
  } catch (err) {
    console.error('[BuyerRoutes.js] addPurchaseRequestHistory error:', err && err.message);
    // Don't rethrow to avoid breaking calling flows
    return null;
  }
}

// expose helper via router so other modules (e.g., admin routes) can call it
router.addPurchaseRequestHistory = addPurchaseRequestHistory;

// POST /api/buyer/upload
router.post('/upload', protect, upload.single('file'), async (req, res) => {
  console.log('[BuyerRoutes.js] POST /api/buyer/upload route hit.');
  try {
    console.log('[BuyerRoutes.js] Request body:', req.body);
    console.log('[BuyerRoutes.js] Request user:', req.user);
    console.log('[BuyerRoutes.js] Uploaded file:', req.file);
    const { title, description, notes, endDate } = req.body;
    const userId = req.user.UserID || req.user.userID || req.user.id;
    if (!title || !description || !endDate || !req.file) {
      console.warn('[BuyerRoutes.js] Missing required fields.', { title, description, endDate, file: !!req.file });
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    // IMPORTANT: prefer req.file.location (DigitalOcean Spaces). Fallback to filesystem path/filename for disk storage.
    const filePath = (req.file && (req.file.location || req.file.path || req.file.filename)) || null;
    const query = `INSERT INTO "BuyerUploads" ("UserID", "Title", "Description", "Notes", "EndDate", "FilePath") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
    const values = [userId, title, description, notes || '', endDate, filePath];
    console.log('[BuyerRoutes.js] Inserting into BuyerUploads:', values);
    const result = await db.query(query, values);
    // Optionally notify admin here
    console.log('[BuyerRoutes.js] Upload successful:', result.rows[0]);
    // Record history entry for creation
    try {
      const uploadId = result.rows[0].uploadid || result.rows[0].UploadID || result.rows[0].UploadId || null;
      if (uploadId) {
        // Prefer human-readable name if available (no id appended)
        const userName = req.user && (req.user.FullName || req.user.fullName || req.user.name || req.user.email) || userId;
        const details = `By: ${userName}`;
        // Non-blocking: fire-and-forget, but log failures
        await addPurchaseRequestHistory(uploadId, 'Created', details);
      }
    } catch (histErr) {
      console.warn('[BuyerRoutes.js] Failed to write creation history:', histErr && histErr.message);
    }
    res.status(201).json({ success: true, upload: result.rows[0] });
  } catch (err) {
    console.error('[BuyerRoutes.js] Error during upload:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});
// GET /api/buyer/requests
router.get('/requests', protect, async (req, res) => {
  try {
    const userId = req.user.UserID || req.user.userID || req.user.id;
    
    // We fetch the data
    const query = `
      SELECT 
        "UploadID" as id, 
        "Title" as title, 
        "Description" as description, 
        "Notes" as notes, 
        "AdminFeedback" as "AdminFeedback", 
        "EndDate" as endDate, 
        "FilePath" as filePath, 
        "Status" as status, 
        "DateUploaded" as createdAt 
      FROM "BuyerUploads" 
      WHERE "UserID" = $1 
      ORDER BY "DateUploaded" DESC
    `;
    
    const result = await db.query(query, [userId]);

    const requests = result.rows.map(row => {
      // 1. ROBUST PATH CHECK: Check both 'filepath' (postgres default) and 'filePath'
      // The 'FilePath' column now stores the full public URL.
      const fileUrl = row.filepath || row.filePath || null;
      let originalFilename = null;

      if (fileUrl) {
        // Extract the original filename from the end of the URL
        const urlParts = fileUrl.split('/');
        const uniqueFilename = urlParts[urlParts.length - 1];
        originalFilename = uniqueFilename.substring(uniqueFilename.indexOf('-') + 1);
      }

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        notes: row.notes,
        adminFeedback: row.adminfeedback || row.AdminFeedback || row.adminFeedback || row.admin_feedback || null,
        status: row.status,
        filePath: fileUrl, // This field now contains the full URL
        endDate: row.enddate || row.endDate,
        createdAt: row.createdat || row.createdAt,
        fileUrl: fileUrl,
        originalFilename: originalFilename
      };
    });

    res.json({ requests });
  } catch (err) {
    console.error('[BuyerRoutes.js] Error fetching requests:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// @desc    Get market items for Buyers (public view)
// @route   GET /api/buyer/market-items
// @access  Private (Authenticated users)
router.get('/market-items', protect, async (req, res) => {
  try {
    const { search, category, supplier, date, minPrice, maxPrice } = req.query;
    const queryParams = [];
    const whereClauses = [];

    // Support category specified as name (from frontend) or as numeric ID.
    let categoryParam = category;
    let categoryIsId = false;
    if (categoryParam) {
      const trimmed = String(categoryParam).trim();
      if (/^\d+$/.test(trimmed)) {
        categoryIsId = true;
        categoryParam = trimmed;
      } else {
        // try to resolve category name to ID
        try {
          const catRes = await db.query('SELECT "CategoryID" FROM "Categories" WHERE LOWER("CategoryName") = LOWER($1) LIMIT 1', [trimmed]);
          if (catRes.rows.length > 0) {
            categoryIsId = true;
            categoryParam = String(catRes.rows[0].CategoryID);
          } else {
            // keep categoryParam as name for fallback filtering by name
            categoryIsId = false;
            categoryParam = trimmed;
          }
        } catch (err) {
          console.warn('[BuyerRoutes.js] Category lookup failed, falling back to name filter', err && err.message);
          categoryIsId = false;
          categoryParam = trimmed;
        }
      }
    }

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

    // Search by item name or supplier company
    if (search) {
      queryParams.push(`%${search.toLowerCase()}%`);
      whereClauses.push(`(LOWER(i."Name") LIKE $${queryParams.length} OR LOWER(s."CompanyName") LIKE $${queryParams.length})`);
    }

    // Filter by supplier id OR supplier company name
    if (supplier) {
      const supTrim = String(supplier).trim();
      if (/^\d+$/.test(supTrim)) {
        queryParams.push(supTrim);
        whereClauses.push(`i."SupplierID" = $${queryParams.length}`);
      } else {
        queryParams.push(supTrim.toLowerCase());
        whereClauses.push(`LOWER(s."CompanyName") = $${queryParams.length}`);
      }
    }

    // Filter by exact or range date (treat provided value as a single-day range)
    if (date) {
      queryParams.push(date);
      queryParams.push(date);
      whereClauses.push(`i."DateUpdated"::date >= $${queryParams.length - 1}::date AND i."DateUpdated"::date <= $${queryParams.length}::date`);
    }

    // Category filter with recursive subcategories when we have an ID; otherwise try name match
    if (categoryParam) {
      if (categoryIsId) {
        queryParams.push(categoryParam);
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
      } else {
        // fallback: match by category name in the joined categories table
        queryParams.push(categoryParam.toLowerCase());
        whereClauses.push(`LOWER(c."CategoryName") = $${queryParams.length}`);
      }
    }

    // Price range filters (optional). Use text regex check before numeric cast.
    if (minPrice) {
      queryParams.push(minPrice);
      whereClauses.push(`(CASE WHEN i."Price"::text ~ '^[0-9]+(\\.[0-9]+)?$' THEN i."Price"::numeric >= $${queryParams.length} ELSE FALSE END)`);
    }
    if (maxPrice) {
      queryParams.push(maxPrice);
      whereClauses.push(`(CASE WHEN i."Price"::text ~ '^[0-9]+(\\.[0-9]+)?$' THEN i."Price"::numeric <= $${queryParams.length} ELSE FALSE END)`);
    }

    if (whereClauses.length > 0) {
      baseQuery += ' WHERE ' + whereClauses.join(' AND ');
    }

    baseQuery += `
      GROUP BY i."ItemID", s."CompanyName"
      ORDER BY COALESCE(i."DateUpdated", i."DatePosted") DESC
      LIMIT 1000
    `;

    const result = await db.query(baseQuery, queryParams);
    const rows = result.rows || [];
    const mapped = rows.map((item) => ({ ...item, categories: item.categories || '' }));
    res.json(mapped);
  } catch (err) {
    console.error('[BuyerRoutes.js] Error fetching market items:', err);
    res.status(500).json({ error: 'Server error while fetching market items.' });
  }
});

// GET /api/buyer/requests/:id/history
router.get('/requests/:id/history', protect, async (req, res) => {
  try {
    const uploadId = parseInt(req.params.id, 10);
    if (!uploadId || isNaN(uploadId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    const q = `SELECT "HistoryID" as historyID, "UploadID" as uploadID, "Action" as action, "Details" as details, "ChangedAt" as changedAt FROM "PurchaseRequestHistory" WHERE "UploadID" = $1 ORDER BY "ChangedAt" DESC`;
    const result = await db.query(q, [uploadId]);
    const rows = result.rows || [];
    res.json({ history: rows });
  } catch (err) {
    console.error('[BuyerRoutes.js] Error fetching history:', err);
    res.status(500).json({ error: 'Server error while fetching history.' });
  }
});

// @desc    Get aggregated market stats for Buyers
// @route   GET /api/buyer/market-stats
// @access  Private (Authenticated users)
router.get('/market-stats', protect, async (req, res) => {
  try {
    const { search, category, supplier, date, minPrice, maxPrice } = req.query;

    const queryParams = [];
    const whereClauses = [];

    // Resolve category param (accept name or id)
    let categoryParam = category;
    let categoryIsId = false;
    if (categoryParam) {
      const trimmed = String(categoryParam).trim();
      if (/^\d+$/.test(trimmed)) {
        categoryIsId = true;
        categoryParam = trimmed;
      } else {
        try {
          const catRes = await db.query('SELECT "CategoryID" FROM "Categories" WHERE LOWER("CategoryName") = LOWER($1) LIMIT 1', [trimmed]);
          if (catRes.rows.length > 0) {
            categoryIsId = true;
            categoryParam = String(catRes.rows[0].CategoryID);
          } else {
            categoryIsId = false;
            categoryParam = trimmed;
          }
        } catch (err) {
          console.warn('[BuyerRoutes.js] market-stats category lookup failed, falling back to name filter', err && err.message);
          categoryIsId = false;
          categoryParam = trimmed;
        }
      }
    }

    const buildFilteredFrom = () => {
      let q = `
        SELECT
          i."ItemID" AS itemid,
          i."Price" AS price,
          i."Stock" AS stock,
          i."EffectiveUntil" AS effectiveuntil,
          s."SupplierID" AS supplierid,
          s."CompanyName" AS suppliername,
          ic."CategoryID" AS categoryid,
          c."CategoryName" AS categoryname,
          COALESCE(i."DateUpdated", i."DatePosted") AS date
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
        const supTrim = String(supplier).trim();
        if (/^\d+$/.test(supTrim)) {
          queryParams.push(supTrim);
          whereClauses.push(`i."SupplierID" = $${queryParams.length}`);
        } else {
          queryParams.push(supTrim.toLowerCase());
          whereClauses.push(`LOWER(s."CompanyName") = $${queryParams.length}`);
        }
      }

      if (date) {
        queryParams.push(date);
        queryParams.push(date);
        whereClauses.push(
          `i."DateUpdated"::date >= $${queryParams.length - 1}::date AND i."DateUpdated"::date <= $${queryParams.length}::date`
        );
      }

      if (categoryParam) {
        if (categoryIsId) {
          queryParams.push(categoryParam);
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
        } else {
          queryParams.push(categoryParam.toLowerCase());
          whereClauses.push(`LOWER(c."CategoryName") = $${queryParams.length}`);
        }
      }

      if (minPrice) {
        queryParams.push(minPrice);
        whereClauses.push(`(CASE WHEN i."Price"::text ~ '^[0-9]+(\\.[0-9]+)?$' THEN i."Price"::numeric >= $${queryParams.length} ELSE FALSE END)`);
      }
      if (maxPrice) {
        queryParams.push(maxPrice);
        whereClauses.push(`(CASE WHEN i."Price"::text ~ '^[0-9]+(\\.[0-9]+)?$' THEN i."Price"::numeric <= $${queryParams.length} ELSE FALSE END)`);
      }

      if (whereClauses.length > 0) {
        q += ' WHERE ' + whereClauses.join(' AND ');
      }

      return q;
    };

    const filteredFrom = buildFilteredFrom();

    const summaryQuery = `
      WITH filtered AS (${filteredFrom})
      SELECT
        COUNT(DISTINCT itemid) AS total_items,
        COUNT(*) AS rows_returned,
        MIN(CASE WHEN price::text ~ '^[0-9]+(\\.[0-9]+)?$' THEN price::numeric ELSE NULL END) AS min_price,
        MAX(CASE WHEN price::text ~ '^[0-9]+(\\.[0-9]+)?$' THEN price::numeric ELSE NULL END) AS max_price,
        AVG(CASE WHEN price::text ~ '^[0-9]+(\\.[0-9]+)?$' THEN price::numeric ELSE NULL END) AS avg_price,
        SUM(CASE WHEN COALESCE(stock,0) > 0 THEN 1 ELSE 0 END) AS in_stock_count,
        SUM(CASE WHEN effectiveuntil::date < CURRENT_DATE THEN 1 ELSE 0 END) AS expired_count,
        SUM(CASE WHEN effectiveuntil::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 1 ELSE 0 END) AS expiring_7d_count
      FROM filtered;
    `;

    const categoryQuery = `
      WITH filtered AS (${filteredFrom})
      SELECT categoryid AS id, categoryname AS name, COUNT(DISTINCT itemid) AS item_count
      FROM filtered
      WHERE categoryid IS NOT NULL
      GROUP BY categoryid, categoryname
      ORDER BY item_count DESC
      LIMIT 20;
    `;

    const supplierQuery = `
      WITH filtered AS (${filteredFrom})
      SELECT supplierid AS id, suppliername AS name, COUNT(DISTINCT itemid) AS item_count
      FROM filtered
      GROUP BY supplierid, suppliername
      ORDER BY item_count DESC
      LIMIT 20;
    `;

    let summaryRes, categoryRes, supplierRes;
    try {
      [summaryRes, categoryRes, supplierRes] = await Promise.all([
        db.query(summaryQuery, queryParams),
        db.query(categoryQuery, queryParams),
        db.query(supplierQuery, queryParams),
      ]);
    } catch (dbErr) {
      console.error('[BuyerRoutes.js] DB query error for market-stats:', dbErr && dbErr.message);
      console.error('[BuyerRoutes.js] summaryQuery:', summaryQuery);
      console.error('[BuyerRoutes.js] categoryQuery:', categoryQuery);
      console.error('[BuyerRoutes.js] supplierQuery:', supplierQuery);
      console.error('[BuyerRoutes.js] queryParams:', queryParams);
      console.error(dbErr && dbErr.stack);
      throw dbErr; // rethrow to be caught by outer catch
    }

    const summary = (summaryRes && summaryRes.rows && summaryRes.rows[0]) || {};

    res.json({
      summary: {
        totalItems: Number(summary.total_items || 0),
        rowsReturned: Number(summary.rows_returned || 0),
        minPrice: summary.min_price !== null ? Number(summary.min_price) : null,
        maxPrice: summary.max_price !== null ? Number(summary.max_price) : null,
        avgPrice: summary.avg_price !== null ? Number(summary.avg_price) : null,
        inStockCount: Number(summary.in_stock_count || 0),
        expiredCount: Number(summary.expired_count || 0),
        expiring7dCount: Number(summary.expiring_7d_count || 0),
      },
      categories: (categoryRes && categoryRes.rows) || [],
      suppliers: (supplierRes && supplierRes.rows) || [],
    });
  } catch (err) {
    console.error('[BuyerRoutes.js] Error fetching market stats:', err);
    res.status(500).json({ error: 'Server error while fetching market stats.' });
  }
});

// @desc    Delete a buyer purchase request
// @route   DELETE /api/buyer/requests/:id
// @access  Private (Buyer - own requests only)
router.delete('/requests/:id', protect, async (req, res) => {
  try {
    const uploadId = parseInt(req.params.id, 10);
    const userId = req.user.UserID || req.user.userID || req.user.id;

    if (!uploadId || isNaN(uploadId)) {
      return res.status(400).json({ error: 'Invalid request ID' });
    }

    // Verify ownership and get file info
    const checkQuery = `
      SELECT "UserID", "Status", "FilePath" 
      FROM "BuyerUploads" 
      WHERE "UploadID" = $1
    `;
    const checkResult = await db.query(checkQuery, [uploadId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = checkResult.rows[0];
    
    // Authorization: Only allow deletion of own requests
    if (request.UserID !== userId) {
      return res.status(403).json({ error: 'Access denied. You can only delete your own requests.' });
    }

    // Business rule: Only allow deletion of pending requests
    if (request.Status !== 'PENDING') {
      return res.status(400).json({ 
        error: `Cannot delete ${request.Status.toLowerCase()} requests. Only pending requests can be deleted.` 
      });
    }

    // Delete from database first
    // record deletion in history before actual delete
    try {
      const userName = req.user && (req.user.FullName || req.user.fullName || req.user.name || req.user.email) || userId;
      const details = `By: ${userName}`;
      await addPurchaseRequestHistory(uploadId, 'Deleted', details);
    } catch (histErr) {
      console.warn('[BuyerRoutes.js] Failed to write deletion history:', histErr && histErr.message);
    }

    const deleteQuery = 'DELETE FROM "BuyerUploads" WHERE "UploadID" = $1';
    await db.query(deleteQuery, [uploadId]);

    // Clean up file if it exists on local disk (not S3/Spaces URL)
    const filePath = request.FilePath;
    if (filePath && !filePath.startsWith('http')) {
      // It's a local file path
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(__dirname, '..', filePath);
      
      fs.unlink(fullPath, (err) => {
        if (err) {
          console.warn('[BuyerRoutes.js] Failed to delete file from disk:', err.message);
        } else {
          console.log('[BuyerRoutes.js] File deleted from disk:', fullPath);
        }
      });
    }
    // Note: For S3/Spaces files, you would need to add deletion logic here
    // using the AWS SDK if you want to remove them from cloud storage

    console.log(`[BuyerRoutes.js] Request ${uploadId} deleted by user ${userId}`);
    res.json({ 
      success: true, 
      message: 'Purchase request deleted successfully' 
    });

  } catch (err) {
    console.error('[BuyerRoutes.js] Delete error:', err);
    res.status(500).json({ error: 'Server error while deleting request.' });
  }
});
module.exports = router;
