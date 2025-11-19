const express = require("express");
const router = express.Router();
const pool = require("../db.js");

// @desc    Get all procurement categories for public access
// @route   GET /api/public/categories
// @access  Public
router.get("/categories", async (req, res) => {
  try {
    // Fetch all categories including parent references
    const result = await pool.query(
      'SELECT "CategoryID", "CategoryName", "ParentCategoryID" FROM "Categories" ORDER BY "ParentCategoryID" ASC, "CategoryName" ASC'
    );

    const rows = result.rows;

    // Build groups where ParentCategoryID === null are top-level groups
    const categoryMap = {};
    rows.forEach(row => {
      categoryMap[row.CategoryID] = { ...row, options: [] };
    });

    const groups = [];
    rows.forEach(row => {
      if (row.ParentCategoryID) {
        // child -> add to parent's options
        if (categoryMap[row.ParentCategoryID]) {
          categoryMap[row.ParentCategoryID].options.push({ CategoryID: row.CategoryID, CategoryName: row.CategoryName });
        }
      } else {
        // parent -> top-level group
        groups.push({ name: row.CategoryName, options: [] });
      }
    });

    // Now map the options into the groups array (ensure ordering matches groups)
    const groupsByName = {};
    groups.forEach(g => { groupsByName[g.name] = g; });
    rows.forEach(row => {
      if (row.ParentCategoryID) {
        const parent = categoryMap[row.ParentCategoryID];
        if (parent) {
          const parentName = parent.CategoryName;
          if (!groupsByName[parentName]) {
            groupsByName[parentName] = { name: parentName, options: [] };
            groups.push(groupsByName[parentName]);
          }
          groupsByName[parentName].options.push({ CategoryID: row.CategoryID, CategoryName: row.CategoryName });
        }
      }
    });

    // Remove any groups that ended up with zero options (optional)
    const dataToSend = groups.filter(g => Array.isArray(g.options) && g.options.length > 0);

    console.log("[Public Categories] Sending:", JSON.stringify(dataToSend, null, 2));
    res.json(dataToSend);
  } catch (err) {
    console.error("Error fetching public categories:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
