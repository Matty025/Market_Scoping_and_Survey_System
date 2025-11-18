const express = require("express");
const router = express.Router();
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

module.exports = router;
