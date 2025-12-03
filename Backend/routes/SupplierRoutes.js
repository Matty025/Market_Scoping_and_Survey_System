const express = require("express");
const router = express.Router();
const multer = require('multer');
const path = require('path');
const xlsx = require('xlsx'); // For reading Excel files
const fs = require('fs');     // For file system operations (deleting temp files)

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
const pool = require("../db.js"); // Your database connection pool

const supplierFileSelectColumns = `
        sf."SupplierFileID",
        sf."Status",
        sf."DateSent" as "dateSent",
        sf."CurrentAttemptNumber" AS "currentAttemptNumber",
        sf."OptInStatus" AS "optInStatus",
        sf."OptedInAt" AS "optedInAt",
        sf."DeclinedAt" AS "declinedAt",
        sf."ReuseResponseID" AS "reuseResponseId",
        sf."LastReusedAt" AS "lastReusedAt",
        pf."FileID",
        pf."Title",
        pf."Description",
        pf."FilePath" as "filePath",
        pf."DatePosted" as "datePosted",
        pf."EndDate" as "endDate",
        attempts.attempt_count AS "attemptCount",
        latest."latestStatus",
        latest."latestNote",
        latest."latestChangedAt",
        lastResponse."ResponseID" AS "lastResponseId",
        lastResponse."ResponseFilePath" AS "lastResponseFilePath",
        lastResponse."DateUploaded" AS "lastResponseDate",
        CASE WHEN pf."EndDate" IS NOT NULL AND pf."EndDate" < NOW() THEN TRUE ELSE FALSE END AS "isExpired",
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
        SELECT COUNT(*) FILTER (WHERE h."NewStatus" = 'ACTIVE') AS attempt_count
        FROM "ProcurementStatusHistory" h
        WHERE h."FileID" = pf."FileID"
      ) attempts ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          h."NewStatus" AS "latestStatus",
          h."Notes" AS "latestNote",
          h."ChangedAt" AS "latestChangedAt"
        FROM "ProcurementStatusHistory" h
        WHERE h."FileID" = pf."FileID"
        ORDER BY h."ChangedAt" DESC
        LIMIT 1
      ) latest ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          sr."ResponseID",
          sr."ResponseFilePath",
          sr."DateUploaded"
        FROM "SupplierResponses" sr
        WHERE sr."SupplierFileID" = sf."SupplierFileID"
        ORDER BY sr."DateUploaded" DESC
        LIMIT 1
      ) lastResponse ON TRUE`;

const supplierFileGroupBy = `
      GROUP BY
        sf."SupplierFileID",
        sf."Status",
        sf."DateSent",
        sf."CurrentAttemptNumber",
        sf."OptInStatus",
        sf."OptedInAt",
        sf."DeclinedAt",
        sf."ReuseResponseID",
        sf."LastReusedAt",
        pf."FileID",
        pf."Title",
        pf."Description",
        pf."FilePath",
        pf."DatePosted",
        pf."EndDate",
        attempts.attempt_count,
        latest."latestStatus",
        latest."latestNote",
        latest."latestChangedAt",
        lastResponse."ResponseID",
        lastResponse."ResponseFilePath",
        lastResponse."DateUploaded"`;

const buildSupplierFileQuery = (whereClause, orderClause = 'ORDER BY sf."DateSent" DESC') => `
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
  
// @desc    Get assigned procurement files for a logged-in supplier
// @route   GET /api/supplier-files
// @access  Private
router.get("/", protect, async (req, res) => {
  console.log("[SupplierRoutes.js] GET / route hit.");
  const loggedInUserId = req.user.userID; // From JWT payload via 'protect' middleware

  try {
    // Find the SupplierID linked to the UserID
    const supplierId = await getSupplierIdForUser(pool, loggedInUserId);

    if (!supplierId) {
      console.log("[SupplierRoutes.js] SupplierID not found for UserID:", loggedInUserId);
      return res.status(404).json({ message: "Supplier profile not found for this user." });
    }

    const assignedFiles = await fetchSupplierFiles({ client: pool, supplierId });
    res.json(assignedFiles);
    console.log("[SupplierRoutes.js] Successfully fetched assigned files.");
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
  const reusePrevious = Boolean(req.body?.reusePrevious);

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

    let responseMessage = "Participation confirmed.";

    if (reusePrevious) {
      const lastResponseRes = await client.query(
        `SELECT "ResponseID", "ResponseFilePath"
         FROM "SupplierResponses"
         WHERE "SupplierFileID" = $1
         ORDER BY "DateUploaded" DESC
         LIMIT 1`,
        [supplierFileId]
      );

      if (lastResponseRes.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "No previous response is available to reuse." });
      }

      const lastResponse = lastResponseRes.rows[0];

      const reuseInsert = await client.query(
        `INSERT INTO "SupplierResponses" ("SupplierFileID", "ResponseFilePath", "IsReused", "SourceResponseID")
         VALUES ($1, $2, TRUE, $3)
         RETURNING "ResponseID"`,
        [supplierFileId, lastResponse.ResponseFilePath, lastResponse.ResponseID]
      );

      const newResponseId = reuseInsert.rows[0].ResponseID;

      await client.query(
        `UPDATE "SupplierFiles"
         SET "Status" = 'Answered',
             "DateResponded" = NOW(),
             "OptInStatus" = 'SUBMITTED',
             "OptedInAt" = COALESCE("OptedInAt", NOW()),
             "DeclinedAt" = NULL,
             "ReuseResponseID" = $2,
             "LastReusedAt" = NOW()
         WHERE "SupplierFileID" = $1`,
        [supplierFileId, newResponseId]
      );

      responseMessage = "Previous response reused.";
    } else {
      await client.query(
        `UPDATE "SupplierFiles"
         SET "Status" = 'PENDING',
             "OptInStatus" = 'OPTED_IN',
             "OptedInAt" = NOW(),
             "DeclinedAt" = NULL,
             "ReuseResponseID" = NULL,
             "LastReusedAt" = NULL
         WHERE "SupplierFileID" = $1`,
        [supplierFileId]
      );
    }

    await client.query("COMMIT");

    const [updated] = await fetchSupplierFiles({
      client: pool,
      supplierId,
      supplierFileIds: [supplierFileId],
      orderClause: ''
    });

    return res.json({ message: responseMessage, supplierFile: updated || null });
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
           "DeclinedAt" = NOW(),
           "ReuseResponseID" = NULL,
           "LastReusedAt" = NULL
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

// ---- Add upload endpoint at bottom ----
router.post('/uploads', protect, upload.single('file'), async (req, res) => { // The 'file' name must match the frontend FormData key
  console.log('[SupplierRoutes] POST /uploads hit');
  const file = req.file;
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
    const logResult = await pool.query(
      `INSERT INTO "SupplierUploads" ("SupplierID", "FilePath", "FileName", "Status") VALUES ($1, $2, $3, 'PROCESSING') RETURNING "UploadID"`,
      [supplierId, file.path, file.originalname]
    );
    uploadLogId = logResult.rows[0].UploadID;

    // 3. Find and read the correct sheet from the Excel file
    const workbook = xlsx.readFile(file.path);
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

        if (!name || isNaN(price) || !unit) {
          console.error(`[UPLOAD_SKIP] Skipping row. Reason: Missing required fields. Parsed values -> Name: ${name}, Price: ${price}, Unit: ${unit}. Original Data: ${JSON.stringify(product)}`);
          continue; // Skip rows that are missing essential data
        }

        const itemInsertResult = await client.query(
          `INSERT INTO "Items" ("SupplierID", "Name", "Description", "Price", "Stock", "Unit", "Location") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "ItemID"`,
          [supplierId, name, description, price, stock, unit, location]
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
    // 6. Clean up by deleting the temporary file from the 'uploads/' folder
    if (file) {
      fs.unlink(file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Failed to delete temporary file:', file.path);
      });
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
                i."DatePosted" as date,
                -- Aggregate categories
                COALESCE(ARRAY_AGG(DISTINCT c."CategoryID") FILTER (WHERE c."CategoryID" IS NOT NULL), '{}') as categories,
                COALESCE(STRING_AGG(DISTINCT c."CategoryName", ', ') , 'N/A') as "categoryNames"
            FROM "Items" i
            LEFT JOIN "ItemCategories" ic ON i."ItemID" = ic."ItemID"
            LEFT JOIN "Categories" c ON ic."CategoryID" = c."CategoryID"
            WHERE ${whereClauses.join(' AND ')}
            ${categoryFilterClause}
            GROUP BY i."ItemID"
            ORDER BY i."DatePosted" DESC
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
  const { name, description, price, stock, unit, location, categories } = req.body;

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
      const updateResult = await client.query(
        `UPDATE "Items" SET "Name" = $1, "Description" = $2, "Price" = $3, "Stock" = $4, "Unit" = $5, "Location" = $6, "DateUpdated" = NOW()
         WHERE "ItemID" = $7 AND "SupplierID" = $8`,
        [name, description, price, stock, unit, location, itemId, supplierId]
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
      const changes = { Name: name, Description: description, Price: price, Stock: stock, Unit: unit, Location: location };  
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

// COMPLETE UPDATED POST /uploads ROUTE
// Replace the entire POST '/uploads' route in your SupplierRoutes.js with this:

router.post('/uploads', protect, upload.single('file'), async (req, res) => {
  console.log('[SupplierRoutes] POST /uploads hit');
  const file = req.file;
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
    const logResult = await pool.query(
      `INSERT INTO "SupplierUploads" ("SupplierID", "FilePath", "FileName", "Status") VALUES ($1, $2, $3, 'PROCESSING') RETURNING "UploadID"`,
      [supplierId, file.path, file.originalname]
    );
    uploadLogId = logResult.rows[0].UploadID;

    // 3. Find and read the correct sheet from the Excel file
    const workbook = xlsx.readFile(file.path);
    let products = [];
    let sheetFound = false;
    const requiredHeaders = ['name', 'price', 'unit'];

    console.log('[UPLOAD_DEBUG] Workbook sheets found:', workbook.SheetNames);
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const sheetDataAsJson = xlsx.utils.sheet_to_json(worksheet);

      if (sheetDataAsJson.length > 0) {
        const firstRowKeys = Object.keys(sheetDataAsJson[0]).map(k => k.toLowerCase().trim());
        console.log(`[UPLOAD_DEBUG] Checking sheet "${sheetName}". Headers found:`, firstRowKeys);
        
        const hasRequiredHeaders = requiredHeaders.every(rh => firstRowKeys.some(frk => frk.includes(rh)));

        if (hasRequiredHeaders) {
          products = sheetDataAsJson;
          sheetFound = true;
          console.log(`[UPLOAD_SUCCESS] Found valid product data in sheet: "${sheetName}". Processing ${products.length} rows.`);
          break;
        }
      }
    }

    if (!sheetFound) {
      throw new Error('Upload failed: Could not find a sheet with the required columns (Name, Price, Unit).');
    }

    // 4. Process and save products with tracking
    const client = await pool.connect();
    
    // --- TRACKING VARIABLES FOR DETAILED FEEDBACK ---
    let processedCount = 0;
    let skippedCount = 0;
    const skippedCategories = new Set();
    const missingCategoryDetails = [];
    
    try {
      await client.query('BEGIN');

      // Pre-fetch all categories for matching
      const allCategoriesResult = await client.query('SELECT "CategoryID", "CategoryName" FROM "Categories"');
      const allCategories = allCategoriesResult.rows.map(c => ({
        id: c.CategoryID,
        name: c.CategoryName.toLowerCase()
      }));

      if (products.length > 0) console.log('[UPLOAD_DEBUG] First product row data:', products[0]);

      for (const product of products) {
        // --- COLUMN MAPPING (Case-Insensitive) ---
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

        // Skip rows with missing required fields
        if (!name || isNaN(price) || !unit) {
          console.error(`[UPLOAD_SKIP] Skipping row. Reason: Missing required fields. Parsed values -> Name: ${name}, Price: ${price}, Unit: ${unit}`);
          skippedCount++;
          continue;
        }

        // Insert item with UploadID for tracking
        const itemInsertResult = await client.query(
          `INSERT INTO "Items" ("SupplierID", "Name", "Description", "Price", "Stock", "Unit", "Location", "UploadID") 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING "ItemID"`,
          [supplierId, name, description, price, stock, unit, location, uploadLogId]
        );
        const newItemId = itemInsertResult.rows[0].ItemID;
        processedCount++;

        // --- ENHANCED CATEGORY HANDLING WITH FEEDBACK ---
        if (categoryName && typeof categoryName === 'string' && newItemId) {
          const foundCategoryIds = new Set();
          
          // Split by comma only (preserves ampersands, hyphens, etc.)
          const categoryNamesFromCell = categoryName.split(',').map(c => c.trim()).filter(Boolean);

          for (const namePart of categoryNamesFromCell) {
            const lowerCaseNamePart = namePart.toLowerCase();
            
            // Exact match only (case-insensitive)
            const matchedCat = allCategories.find(c => c.name === lowerCaseNamePart);
            
            if (matchedCat) {
              foundCategoryIds.add(matchedCat.id);
              console.log(`[UPLOAD] ✓ Matched category: "${namePart}" -> ID: ${matchedCat.id}`);
            } else {
              // Track missing categories for user feedback
              skippedCategories.add(namePart);
              missingCategoryDetails.push({ item: name, category: namePart });
              console.warn(`[UPLOAD] ✗ Category "${namePart}" for item "${name}" was not found in the database and was skipped.`);
            }
          }

          // Insert all valid category IDs
          for (const categoryId of foundCategoryIds) {
            if (categoryId) {
              await client.query(
                'INSERT INTO "ItemCategories" ("ItemID", "CategoryID") VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [newItemId, categoryId]
              );
            }
          }
        }
      }

      await client.query('COMMIT');

      // Update upload log with processed count
      await client.query(
        `UPDATE "SupplierUploads" SET "Status" = 'COMPLETED', "RowCount" = $1, "ProcessedAt" = NOW() WHERE "UploadID" = $2`,
        [processedCount, uploadLogId]
      );

      // --- BUILD DETAILED RESPONSE ---
      let responseMessage = `Successfully processed ${processedCount} product${processedCount !== 1 ? 's' : ''}.`;
      const warnings = [];

      if (skippedCount > 0) {
        warnings.push(`${skippedCount} row${skippedCount !== 1 ? 's were' : ' was'} skipped due to missing required fields (Name, Price, or Unit).`);
      }

      if (skippedCategories.size > 0) {
        warnings.push(`${skippedCategories.size} category name${skippedCategories.size !== 1 ? 's' : ''} not found in database: "${Array.from(skippedCategories).join('", "')}". Items were created but these categories were not assigned.`);
      }

      // Return comprehensive response
      res.status(201).json({ 
        message: responseMessage,
        uploadId: uploadLogId,
        summary: {
          totalRows: products.length,
          processed: processedCount,
          skipped: skippedCount,
          skippedCategories: Array.from(skippedCategories),
          missingCategoryDetails: missingCategoryDetails.length > 0 ? missingCategoryDetails : null
        },
        warnings: warnings.length > 0 ? warnings : null
      });

    } catch (transactionError) {
      await client.query('ROLLBACK');
      throw transactionError;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Upload error:', err);

    // Mark upload as failed
    if (uploadLogId) {
      await pool.query(`UPDATE "SupplierUploads" SET "Status" = 'FAILED' WHERE "UploadID" = $1`, [uploadLogId]);
    }
    res.status(500).json({ message: 'Server error while processing file', error: err.message });
  } finally {
    // Clean up temporary file
    if (file) {
      fs.unlink(file.path, (unlinkErr) => {
        if (unlinkErr) console.error('Failed to delete temporary file:', file.path);
      });
    }
  }
});

module.exports = router;