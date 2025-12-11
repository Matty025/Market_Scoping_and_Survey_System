const express = require('express');
const router = express.Router();
const { protect } = require('./authMiddleware');
const { generateSasUrl, blobServiceClient } = require('../utils/azureBlob');

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
    const sasUrl = generateSasUrl(containerName, blobName, ttl);
    return res.json({ url: sasUrl });
  } catch (err) {
    console.error('[fileRoutes] SAS generation error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Failed to generate SAS URL' });
  }
});

module.exports = router;
