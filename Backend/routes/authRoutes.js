const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("../models/UserModel");

const router = express.Router();

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
