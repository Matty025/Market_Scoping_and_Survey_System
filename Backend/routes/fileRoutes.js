const express = require('express');
const router = express.Router();
const { protect } = require('./authMiddleware');
const { generateSasUrl, blobServiceClient } = require('../utils/azureBlob');
const pool = require('../db');

// GET /api/files/sas?blobUrl=<full-blob-url>&minutes=15
router.get('/sas', protect, async (req, res) => {
  const { blobUrl, minutes } = req.query;
  if (!blobUrl) return res.status(400).json({ message: 'blobUrl query parameter is required' });

  if (!blobServiceClient) {
    return res.status(400).json({ message: 'Azure Blob Service not configured on server' });
  }

  try {
    // Support full URL (https://account.blob.core.windows.net/container/path/to/blob)
    let parsed;
    try {
      parsed = new URL(blobUrl);
    } catch (e) {
      return res.status(400).json({ message: 'Invalid blobUrl' });
    }

    // pathname starts with /container/blobName
    const parts = parsed.pathname.replace(/^\//, '').split('/');
    const containerName = parts.shift();
    const blobName = parts.join('/');

    if (!containerName || !blobName) return res.status(400).json({ message: 'Could not parse container/blob from URL' });

    const ttl = Number(minutes) || 15;
    // SECURITY: If this blob belongs to a supplier response/upload, ensure the requester owns it.
    try {
      const userId = req.user && req.user.userID;
      // attempt to locate a SupplierResponses entry matching either the full URL or the blobName
      const respQ = `
        SELECT sr."ResponseID", sf."SupplierID"
        FROM "SupplierResponses" sr
        JOIN "SupplierFiles" sf ON sr."SupplierFileID" = sf."SupplierFileID"
        WHERE sr."ResponseFilePath" = $1 OR sr."ResponseFilePath" LIKE '%' || $2
        LIMIT 1
      `;
      const respRes = await pool.query(respQ, [blobUrl, blobName]);
      if (respRes.rowCount > 0) {
        const ownerSupplierId = respRes.rows[0].SupplierID;
        // fetch requesting user's SupplierID
        const userQ = await pool.query('SELECT "SupplierID", "Role" FROM "Users" WHERE "UserID" = $1', [userId]);
        const requesterSupplierId = userQ.rows[0]?.SupplierID;
        const role = userQ.rows[0]?.Role || req.user?.role;
        // allow if admin role or the supplier owns the response
        const isAdmin = role && String(role).toLowerCase().includes('admin');
        if (!isAdmin && requesterSupplierId !== ownerSupplierId) {
          return res.status(403).json({ message: 'You are not authorised to access this file.' });
        }
      }
    } catch (authCheckErr) {
      console.warn('[fileRoutes] ownership check failed', authCheckErr && authCheckErr.message ? authCheckErr.message : authCheckErr);
      // fall through to SAS generation if we can't validate ownership for other reasons
    }

    const sasUrl = generateSasUrl(containerName, blobName, ttl);
    return res.json({ url: sasUrl });
  } catch (err) {
    console.error('[fileRoutes] SAS generation error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Failed to generate SAS URL' });
  }
});

module.exports = router;
