const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { protect } = require('./authMiddleware');
const fs = require('fs');
const { notifyAdminNewPurchaseRequest } = require('../services/prNotificationService');
const notificationService = require('../services/notificationService');

// Prefer Supabase Storage; fall back to DigitalOcean S3 (aws-sdk) or local disk.
const { uploadBuffer, generateSignedUrl, deleteFile } = require('../utils/supabaseStorage');
let aws;
let multerS3;
const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let buyerUploadsNotesColumnExists;
const hasBuyerUploadsNotesColumn = async () => {
  if (buyerUploadsNotesColumnExists !== undefined) {
    return buyerUploadsNotesColumnExists;
  }

  try {
    const { rows } = await db.query(`
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
    console.warn('[BuyerRoutes.js] Failed to detect BuyerUploads.Notes column:', err.message);
    buyerUploadsNotesColumnExists = false;
  }

  return buyerUploadsNotesColumnExists;
};

try {
  aws = require('aws-sdk');
  multerS3 = require('multer-s3');
} catch (e) {
  // optional
}

let storage;
if (useSupabase) {
  storage = multer.memoryStorage();
} else if (aws && multerS3) {
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
      acl: 'public-read',
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

// Avatar uploader (separate from PDF filter)
let avatarStorage;
if (useSupabase) {
  avatarStorage = multer.memoryStorage();
} else {
  avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const dest = path.join(__dirname, '..', 'uploads');
      try { fs.mkdirSync(dest, { recursive: true }); } catch (_) {}
      cb(null, dest);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const safeName = (file.originalname || 'avatar').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${uniqueSuffix}-${safeName}`);
    },
  });
}
const avatarUpload = multer({ storage: avatarStorage });

// Helper: add a history entry for a purchase request
async function addPurchaseRequestHistory(uploadId, action, details) {
  try {
    const q = `INSERT INTO "PurchaseRequestHistory" ("UploadID", action, "Details") VALUES ($1, $2, $3) RETURNING *`;
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

// Basic buyer profile fetch
router.get('/profile', protect, async (req, res) => {
  try {
    if (!req.user || (req.user.role || '').toLowerCase() !== 'buyer') {
      return res.status(403).json({ message: 'Only buyers can view this profile.' });
    }

    const userId = req.user.userID || req.user.UserID || req.user.id;
    const profileRes = await db.query(
      `SELECT u."UserID" AS "id",
              u."FullName" AS "fullName",
              u."Email" AS "email",
              u."email_verified" AS "email_verified",
              r."RoleName" AS "role",
              u."ProfileImageUrl" AS "profileImageUrl",
              u."DateCreated" AS "joinedAt"
         FROM "Users" u
         LEFT JOIN "Roles" r ON r."RoleID" = u."RoleID"
        WHERE u."UserID" = $1
        LIMIT 1`,
      [userId]
    );

    if (profileRes.rowCount === 0) {
      return res.status(404).json({ message: 'Profile not found.' });
    }

    const profile = profileRes.rows[0];

    let signedAvatarUrl = null;
    if (profile.profileImageUrl) {
      try {
        signedAvatarUrl = await generateSignedUrl(profile.profileImageUrl, 60);
      } catch (sigErr) {
        console.warn('[BuyerRoutes] Avatar signed URL failed:', sigErr && sigErr.message ? sigErr.message : sigErr);
        signedAvatarUrl = null;
      }
    }

    return res.json({
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      email_verified: profile.email_verified,
      role: profile.role,
      profileImageUrl: signedAvatarUrl,
      profileImagePath: profile.profileImageUrl || null,
      joinedAt: profile.joinedAt,
    });
  } catch (err) {
    console.error('Error fetching buyer profile:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error while fetching profile.' });
  }
});

// Update buyer profile picture
router.post('/profile/avatar', protect, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.user || (req.user.role || '').toLowerCase() !== 'buyer') {
      return res.status(403).json({ message: 'Only buyers can update this profile.' });
    }

    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ message: 'Avatar file is required.' });
    }

    const userId = req.user.userID || req.user.UserID || req.user.id;

    // Fetch previous avatar path for cleanup
    const prevRes = await db.query('SELECT "ProfileImageUrl" FROM "Users" WHERE "UserID" = $1', [userId]);
    const previousAvatarPath = prevRes.rows[0]?.ProfileImageUrl || null;

    const safeName = (file.originalname || 'avatar').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ymd = new Date().toISOString().slice(0, 10);
    const blobName = `buyer-profile/${userId}/${ymd}/avatar-${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`;

    let blobPath;
    try {
      blobPath = await uploadBuffer(blobName, file.buffer, file.mimetype || 'image/png');
    } catch (uploadErr) {
      console.error('[BuyerRoutes] Avatar upload failed:', uploadErr && uploadErr.message ? uploadErr.message : uploadErr);
      return res.status(500).json({ message: 'Failed to upload avatar to storage.' });
    }

    await db.query('UPDATE "Users" SET "ProfileImageUrl" = $1 WHERE "UserID" = $2', [blobPath, userId]);
    const signedUrl = await generateSignedUrl(blobPath, 60);

    // Best-effort cleanup of previous avatar
    if (previousAvatarPath && previousAvatarPath !== blobPath) {
      try {
        await deleteFile(previousAvatarPath);
      } catch (delErr) {
        console.warn('[BuyerRoutes] Failed to delete previous avatar:', delErr && delErr.message ? delErr.message : delErr);
      }
    }

    return res.json({ message: 'Avatar updated.', profileImageUrl: signedUrl, profileImagePath: blobPath });
  } catch (err) {
    console.error('Error updating buyer avatar:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error while updating avatar.' });
  }
});

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
    // IMPORTANT: prefer Supabase blob path; fallback to Spaces/disk path if needed.
    let filePath = null;
    if (useSupabase && req.file && req.file.buffer) {
      try {
        const safeName = (req.file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
        const blobName = `buyer-pr/${Date.now()}-${Math.round(Math.random()*1e9)}-${safeName}`;
        filePath = await uploadBuffer(blobName, req.file.buffer, req.file.mimetype);
      } catch (supaErr) {
        console.error('[BuyerRoutes.js] Supabase upload failed:', supaErr);
        filePath = (req.file && (req.file.location || req.file.path || req.file.filename)) || null;
      }
    } else {
      filePath = (req.file && (req.file.location || req.file.path || req.file.filename)) || null;
    }
    const hasNotesColumn = await hasBuyerUploadsNotesColumn();
    const query = hasNotesColumn
      ? `INSERT INTO "BuyerUploads" ("UserID", "Title", "Description", "Notes", "EndDate", "FilePath") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`
      : `INSERT INTO "BuyerUploads" ("UserID", "Title", "Description", "EndDate", "FilePath") VALUES ($1, $2, $3, $4, $5) RETURNING *`;
    const values = hasNotesColumn
      ? [userId, title, description, notes || '', endDate, filePath]
      : [userId, title, description, endDate, filePath];
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

    // Notify admins of new purchase request (fire-and-forget)
    const uploadId = result.rows[0]?.uploadid || result.rows[0]?.UploadID || result.rows[0]?.UploadId;
    if (uploadId) {
      notifyAdminNewPurchaseRequest(uploadId).catch((err) => {
        console.warn('[BuyerRoutes.js] Failed to send admin PR notification:', err && err.message ? err.message : err);
      });

      notificationService.notifyAdmins({
        type: 'purchase_request_new',
        title: 'New purchase request submitted',
        body: `${(req.user && (req.user.FullName || req.user.fullName || req.user.name || req.user.email)) || 'Buyer'} submitted "${title}"`,
        metadata: {
          uploadId,
          title,
          endDate,
          path: `/admin/dashboard?tab=purchase-requests&uploadId=${uploadId}`,
        },
      }).catch((err) => {
        console.warn('[BuyerRoutes.js] Failed to create admin in-app notification for new PR:', err && err.message ? err.message : err);
      });
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
    const hasNotesColumn = await hasBuyerUploadsNotesColumn();
    const notesSelect = hasNotesColumn ? '"Notes" as notes,' : 'NULL::text as notes,';
    
    // We fetch the data
    const query = `
      SELECT 
        "UploadID" as id, 
        "Title" as title, 
        "Description" as description, 
        ${notesSelect} 
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
        COALESCE(MAX(u."ProfileImageUrl"), NULL) AS "logoPath",
        STRING_AGG(c."CategoryName", ', ') AS categories
      FROM "Items" i
      JOIN "Suppliers" s ON i."SupplierID" = s."SupplierID"
      LEFT JOIN "Users" u ON u."SupplierID" = s."SupplierID"
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

    const mapped = await Promise.all(rows.map(async (item) => {
      let logoSignedUrl = null;
      if (item.logoPath) {
        try {
          logoSignedUrl = await generateSignedUrl(item.logoPath, 60);
        } catch (sigErr) {
          console.warn('[BuyerRoutes] Failed to sign supplier logo:', sigErr && sigErr.message ? sigErr.message : sigErr);
          logoSignedUrl = null;
        }
      }
      return {
        ...item,
        categories: item.categories || '',
        logoPath: item.logoPath || null,
        logoUrl: logoSignedUrl || item.logoPath || null,
      };
    }));

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

    const q = `SELECT "HistoryID" as historyID, "UploadID" as uploadID, action as action, "Details" as details, "ChangedAt" as changedAt FROM "PurchaseRequestHistory" WHERE "UploadID" = $1 ORDER BY "ChangedAt" DESC`;
    const result = await db.query(q, [uploadId]);
    const rows = result.rows || [];

    // Post-process: if Details contains an actor as a numeric id (e.g. "By: 3"), resolve FullName from Users table
    const nameCache = {};
    const processed = [];
    for (const r of rows) {
      let details = r.details || '';
      // Look for a leading "By: <actor>" line
      const lines = String(details).split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0 && /^By:/i.test(lines[0])) {
        const actorRaw = lines[0].replace(/^By:\s*/i, '').trim();
        if (/^\d+$/.test(actorRaw)) {
          const uid = parseInt(actorRaw, 10);
          if (!isNaN(uid)) {
            try {
              if (!nameCache[uid]) {
                const uq = 'SELECT "FullName" FROM "Users" WHERE "UserID" = $1 LIMIT 1';
                const ur = await db.query(uq, [uid]);
                nameCache[uid] = (ur.rows && ur.rows[0] && ur.rows[0].FullName) || null;
              }
              const resolved = nameCache[uid];
              if (resolved) {
                lines[0] = `By: ${resolved}`;
                details = lines.join('\n');
              }
            } catch (e) {
              // ignore lookup errors
              console.warn('[BuyerRoutes] user lookup failed for history actor', uid, e && e.message);
            }
          }
        }
      }

      processed.push({ ...r, details });
    }

    res.json({ history: processed });
  } catch (err) {
    console.error('[BuyerRoutes.js] Error fetching history:', err);
    res.status(500).json({ error: 'Server error while fetching history.' });
  }
});

// GET /api/buyer/users/:id - return basic user info (FullName) for authenticated users
router.get('/users/:id', protect, async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!userId || isNaN(userId)) return res.status(400).json({ error: 'Invalid user id' });

    const q = 'SELECT "UserID", "FullName", "Email" FROM "Users" WHERE "UserID" = $1 LIMIT 1';
    const { rows } = await db.query(q, [userId]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const u = rows[0];
    res.json({ user: { UserID: u.UserID, FullName: u.FullName, Email: u.Email } });
  } catch (err) {
    console.error('[BuyerRoutes.js] Error fetching user by id:', err);
    res.status(500).json({ error: 'Server error' });
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
