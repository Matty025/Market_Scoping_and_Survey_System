const express = require("express");
const router = express.Router();
const { protect } = require("./authMiddleware");
const pool = require("../db.js");

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private (Admin)
router.get("/stats", protect, async (req, res) => {
  if (req.user.role.toLowerCase() !== 'admin') {
    return res.status(403).json({ message: "Access denied. Admins only." });
  }

  try {
    const totalSuppliers = await pool.query('SELECT COUNT(*) FROM "Suppliers"');
    const pendingAccounts = await pool.query('SELECT COUNT(*) FROM "Users" WHERE "RoleID" = 2 AND "SupplierID" IS NULL'); // Assuming RoleID 2 is Supplier and they are pending if SupplierID is null
    const activeAnnouncements = await pool.query('SELECT COUNT(*) FROM "ProcurementFiles" WHERE "EndDate" >= NOW()');

    res.json({
      totalSuppliers: parseInt(totalSuppliers.rows[0].count, 10),
      pendingAccounts: parseInt(pendingAccounts.rows[0].count, 10),
      activeAnnouncements: parseInt(activeAnnouncements.rows[0].count, 10),
    });
  } catch (err) {
    console.error("Error fetching dashboard stats:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @desc    Get announcements grouped by category for charts
// @route   GET /api/dashboard/announcements-by-category
// @access  Private (Admin)
router.get("/announcements-by-category", protect, async (req, res) => {
    if (req.user.role.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: "Access denied. Admins only." });
    }

    try {
        const query = `
            SELECT c."CategoryName" as name, COUNT(pf."FileID")::int as value
            FROM "Categories" c
            LEFT JOIN "ProcurementFiles" pf ON c."CategoryID" = pf."CategoryID"
            GROUP BY c."CategoryName"
            HAVING COUNT(pf."FileID") > 0
            ORDER BY value DESC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error("Error fetching announcements by category:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});


module.exports = router;