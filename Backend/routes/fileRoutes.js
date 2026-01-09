const express = require('express');
const router = express.Router();
const { protect } = require('./authMiddleware');
const { generateSignedUrl } = require('../utils/supabaseStorage');
const pool = require('../db');

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// GET /api/files/sas?blobUrl=<full-blob-url>&minutes=15
router.get('/sas', protect, async (req, res) => {
  const { blobUrl, minutes } = req.query;
  if (!blobUrl) return res.status(400).json({ message: 'blobUrl query parameter is required' });

  if (!useSupabase) {
    return res.status(400).json({ message: 'Supabase Storage not configured on server' });
  }

  try {
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
      const keyPart = blobUrl.split('/').pop();
      const respRes = await pool.query(respQ, [blobUrl, keyPart]);
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

    const signedUrl = await generateSignedUrl(blobUrl, ttl);
    return res.json({ url: signedUrl });
  } catch (err) {
    console.error('[fileRoutes] signed URL generation error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Failed to generate signed URL' });
  }
});

module.exports = router;
