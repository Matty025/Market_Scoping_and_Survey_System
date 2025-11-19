const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("../models/UserModel");
const SupplierModel = require("../models/SupplierModel");
const pool = require("../db");

const router = express.Router();

// REGISTER (Buyer or Supplier)
router.post("/register", async (req, res) => {
  try {
    const {
      role, // 'buyer' | 'supplier'
      fullName,
      email,
      password,
      // Supplier-only
      companyName,
      address,
      contactNumber,
      hasPhilgeps,
      hasSecRegistration,
      hasBusinessPermit,
      hasTaxClearance,
      categories, // <-- This will be an array of CategoryIDs
    } = req.body;

    if (!role || !fullName || !email || !password)
      return res.status(400).json({ message: "Missing required fields" });

    const normalizedRole = String(role).toLowerCase();
    if (!["buyer", "supplier"].includes(normalizedRole))
      return res.status(400).json({ message: "Invalid role" });

    // Check duplicate email
    const existing = await pool.query(`SELECT 1 FROM "Users" WHERE "Email"=$1`, [email]);
    if (existing.rowCount > 0)
      return res.status(409).json({ message: "Email already registered" });

    // Resolve RoleID (hardcode buyer=3, lookup others)
    let roleId;
    if (normalizedRole === "buyer") {
      roleId = 3;
    } else {
      const roleRes = await pool.query(
        `SELECT "RoleID" FROM "Roles" WHERE LOWER("RoleName") = LOWER($1)`,
        [normalizedRole]
      );
      if (roleRes.rowCount === 0)
        return res.status(400).json({ message: `Role '${normalizedRole}' not found` });
      roleId = roleRes.rows[0].RoleID;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Use a transaction to ensure all or nothing is saved
    const client = await pool.connect();

    if (normalizedRole === "buyer") {
      try {
        const user = await UserModel.createUser(fullName, email, passwordHash, roleId);
        return res.status(201).json({
          message: "Buyer registered successfully",
          user: {
            userID: user.UserID,
            fullName: user.FullName,
            email: user.Email,
            role: "buyer",
          },
        });
      } finally {
        client.release();
      }
    }

    // Supplier registration
    if (!companyName || !address || !contactNumber)
      return res.status(400).json({ message: "Missing supplier fields" });

    try {
      await client.query("BEGIN");

      // 1. Create supplier
      const supplier = await SupplierModel.createSupplier(
        companyName, address, contactNumber,
        !!hasPhilgeps, !!hasSecRegistration, !!hasBusinessPermit, !!hasTaxClearance,
        client // Pass the client for transaction
      );
      const newSupplierId = supplier.SupplierID;

      // 2. Create user linked to the supplier
      const user = await UserModel.createSupplierUser(
        fullName, email, passwordHash, roleId, newSupplierId,
        client // Pass the client for transaction
      );

      // 3. Link supplier to categories
      if (categories && Array.isArray(categories) && categories.length > 0) {
        const categoryInsertQuery = `
          INSERT INTO "SupplierCategories" ("SupplierID", "CategoryID")
          SELECT $1, "CategoryID" FROM UNNEST($2::int[]) AS "CategoryID"
        `;
        await client.query(categoryInsertQuery, [newSupplierId, categories]);
        console.log(`[Register] Linked supplier ${newSupplierId} to categories: ${categories.join(', ')}`);
      }

      await client.query("COMMIT");

      return res.status(201).json({
        message: "Supplier registered successfully",
        supplier,
        user: {
          userID: user.UserID,
          fullName: user.FullName,
          email: user.Email,
          role: "supplier",
        },
      });
    } catch (transactionError) {
      await client.query("ROLLBACK");
      console.error("Supplier registration transaction error:", transactionError);
      return res.status(500).json({ message: "Server error during registration." });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// LOGIN ROUTE
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Login attempt:", { email, password }); // DEBUG: incoming request

  try {
    const user = await UserModel.findByEmail(email);
    console.log("User found:", user); // DEBUG: user from DB

    if (!user) {
      console.log("No user found"); // DEBUG
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.PasswordHash);
    console.log("Password valid:", valid); // DEBUG

    if (!valid) {
      console.log("Password incorrect"); // DEBUG
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userID: user.UserID, role: user.RoleName  },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    console.log("JWT token created:", token); // DEBUG

    res.json({
      message: "Login successful",
      token,
      user: {
        userID: user.UserID,
        email: user.Email,
        fullName: user.FullName,
        role: user.RoleName.toLowerCase(),
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;  
