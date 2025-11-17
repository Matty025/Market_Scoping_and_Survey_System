const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const SupplierModel = require("../models/SupplierModel");
const UserModel = require("../models/UserModel");

// SUPPLIER REGISTRATION
router.post("/register", async (req, res) => {
  try {
    const {
      FullName,
      Email,
      Password,
      CompanyName,
      Address,
      ContactNumber,
      HasPhilgeps = false,
      HasSECRegistration = false,
      HasBusinessPermit = false,
      HasTaxClearance = false,
    } = req.body;

    // 1. Create supplier
    const supplier = await SupplierModel.createSupplier(
      CompanyName,
      Address,
      ContactNumber,
      HasPhilgeps,
      HasSECRegistration,
      HasBusinessPermit,
      HasTaxClearance
    );

    // 2. Hash password
    const PasswordHash = await bcrypt.hash(Password, 10);

    // 3. Supplier role ID (example: 2)
    const SupplierRoleID = 2;

    // 4. Create linked User
    const user = await UserModel.createSupplierUser(
      FullName,
      Email,
      PasswordHash,
      SupplierRoleID,
      supplier.SupplierID
    );

    res.json({
      message: "Supplier account created successfully",
      supplier,
      user,
    });

  } catch (err) {
    console.error("Error in supplier registration:", err);
    res.status(500).json({ error: "Failed to register supplier" });
  }
});

module.exports = router;
