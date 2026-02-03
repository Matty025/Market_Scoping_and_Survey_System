const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("../models/UserModel");
const SupplierModel = require("../models/SupplierModel");
const pool = require("../db");
const { protect } = require("./authMiddleware");
const { sendVerificationEmail } = require("../services/emailVerificationService");
const { sendPendingAccountEmail } = require("../services/adminNotificationService");
const notificationService = require("../services/notificationService");
const preverifyStore = require("../services/preverifyStore");
const passwordResetService = require("../services/passwordResetService");

// In-memory edit throttle (per process). For production, move to Redis/DB.
const editLimit = new Map();
const EDIT_WINDOW_MS = 60 * 1000; // 1 minute for debugging (was 24h)
// In-memory forgot-password throttle. For production, prefer Redis/DB + IP reputation.
const forgotLimit = new Map();
const FORGOT_WINDOW_MS = 60 * 1000; // 1 minute window
const FORGOT_MAX_ATTEMPTS = 3; // max attempts per window per (ip+email)

// In-memory login throttle (per process). For production, move to Redis/DB.
const loginLimit = new Map(); // key: emailLower -> { count, lockedUntil }
const LOGIN_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const LOGIN_MAX_ATTEMPTS = 5;

// In-memory change-password throttle (per process). Keeps quick successive submits down.
const passwordChangeLimit = new Map();
const PASSWORD_WINDOW_MS = 30 * 1000; // 30s window
const PASSWORD_MAX_ATTEMPTS = 3;

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
      driveFolderUrl,
      categories, // <-- This will be an array of CategoryIDs
      preverifyToken,
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

    // Require pre-verification token (email ownership) before creating account
    const precheck = await preverifyStore.requireVerified(email, preverifyToken);
    if (!precheck.ok) {
      const reason = precheck.reason === "unverified" ? "Please verify your email before registering." : "Email verification is invalid or expired.";
      return res.status(400).json({ message: reason });
    }

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
        const user = await UserModel.createUser(fullName, email, passwordHash, roleId, client);
        // Fire-and-forget verification email (do not block signup on failure)
        try {
          await sendVerificationEmail(user.UserID, email);
        } catch (e) {
          console.warn("[register/buyer] Failed to send verification email:", e && e.message ? e.message : e);
        }

        // Notify admins of new pending account (fire-and-forget)
        sendPendingAccountEmail({ fullName, email, role: "buyer" }).catch(() => {});
        try {
          await notificationService.notifyAdmins({
            type: "account_pending",
            title: "New registration pending approval",
            body: `${fullName || email} registered as buyer and awaits review`,
            metadata: {
              role: "buyer",
              email,
              fullName: fullName || null,
              companyName: null,
              sourceId: email,
              path: `/admin/manage-accounts?email=${encodeURIComponent(email)}`,
            },
          });
        } catch (notifyErr) {
          console.warn('[register/buyer] Failed to create admin notification:', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
        }

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
        companyName,
        address,
        contactNumber,
        !!hasPhilgeps,
        !!hasSecRegistration,
        !!hasBusinessPermit,
        !!hasTaxClearance,
        driveFolderUrl ? driveFolderUrl.toString().trim() : null,
        client // use same transaction client
      );
      const newSupplierId = supplier.SupplierID;

      // 2. Create user linked to the supplier
      const user = await UserModel.createSupplierUser(
        fullName, email, passwordHash, roleId, newSupplierId,
        client // use same transaction client
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

      // Fire-and-forget verification email (do not block signup on failure)
      try {
        await sendVerificationEmail(user.UserID, email);
      } catch (e) {
        console.warn("[register/supplier] Failed to send verification email:", e && e.message ? e.message : e);
      }

      // Notify admins of new pending account (fire-and-forget)
      sendPendingAccountEmail({ fullName, email, role: "supplier", companyName }).catch(() => {});
      try {
        await notificationService.notifyAdmins({
          type: "account_pending",
          title: "New registration pending approval",
          body: `${fullName || email} from ${companyName || 'supplier'} registered and awaits review`,
          metadata: {
            role: "supplier",
            email,
            fullName: fullName || null,
            companyName: companyName || null,
            sourceId: email,
            path: `/admin/manage-accounts?email=${encodeURIComponent(email)}`,
          },
        });
      } catch (notifyErr) {
        console.warn('[register/supplier] Failed to create admin notification:', notifyErr && notifyErr.message ? notifyErr.message : notifyErr);
      }

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
    const emailKey = (email || "").toLowerCase().trim();
    const now = Date.now();
    const entry = loginLimit.get(emailKey);
    if (entry && entry.lockedUntil && now < entry.lockedUntil) {
      const retryIn = Math.ceil((entry.lockedUntil - now) / 1000);
      return res.status(429).json({ message: `Too many attempts. Try again in ${retryIn}s.` });
    }

    const user = await UserModel.findByEmail(email);
    console.log("User found:", user); // DEBUG: user from DB

    if (!user) {
      console.log("No user found"); // DEBUG
      const attempts = entry && entry.count ? entry.count + 1 : 1;
      const lockedUntil = attempts >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_WINDOW_MS : 0;
      loginLimit.set(emailKey, { count: attempts, lockedUntil });
      return res.status(400).json({ message: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.PasswordHash);
    console.log("Password valid:", valid); // DEBUG

    if (!valid) {
      console.log("Password incorrect"); // DEBUG
      const attempts = entry && entry.count ? entry.count + 1 : 1;
      const lockedUntil = attempts >= LOGIN_MAX_ATTEMPTS ? now + LOGIN_WINDOW_MS : 0;
      loginLimit.set(emailKey, { count: attempts, lockedUntil });
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Success: clear throttle state for this email
    loginLimit.delete(emailKey);

    // Enforce account status stored in "AccountStatus" column
    const accountStatus = (user.AccountStatus || '').toString().toUpperCase();
    if (accountStatus === 'BLACKLISTED') {
      return res.status(403).json({ message: 'Account blacklisted. Contact administrator.' });
    }
    if (accountStatus !== 'APPROVED') {
      // For PENDING or REJECTED and any other non-approved statuses
      return res.status(403).json({ message: 'Your account is waiting for approval. Please contact the DepEd office with required documents.' });
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

// Forgot password - send reset link (non-enumerating response)
router.post("/forgot", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: "Email is required" });

  const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() || req.ip || "unknown";
  const key = `${ip}|${email.toLowerCase()}`;
  const now = Date.now();
  const entry = forgotLimit.get(key);
  if (entry && entry.resetAt > now) {
    if (entry.count >= FORGOT_MAX_ATTEMPTS) {
      const retryIn = Math.ceil((entry.resetAt - now) / 1000);
      return res.status(429).json({ message: "Too many reset attempts. Try again soon.", retryInSeconds: retryIn });
    }
    entry.count += 1;
    forgotLimit.set(key, entry);
  } else {
    forgotLimit.set(key, { count: 1, resetAt: now + FORGOT_WINDOW_MS });
  }

  const baseUrl = process.env.FRONTEND_URL
    || req.headers.origin
    || req.headers.referer
    || "http://localhost:5173";

  try {
    await passwordResetService.requestPasswordReset(email, { baseUrl, expiresMinutes: 60 });
  } catch (err) {
    console.error("[auth/forgot] error:", err && err.message ? err.message : err);
    // Still return 200 to avoid email enumeration
  }

  return res.json({ message: "If the email exists, we sent a reset link." });
});

// Reset password using token
router.post("/reset", async (req, res) => {
  const { token, password, confirmPassword } = req.body || {};

  if (!token || !password) return res.status(400).json({ message: "Token and new password are required." });
  if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters." });
  if (confirmPassword && confirmPassword !== password) return res.status(400).json({ message: "Passwords do not match." });

  try {
    const result = await passwordResetService.resetPasswordWithToken(token, password);
    if (!result.ok) {
      return res.status(400).json({ message: "Invalid or expired reset link." });
    }
    return res.json({ message: "Password has been reset. You can now log in." });
  } catch (err) {
    console.error("[auth/reset] error:", err && err.message ? err.message : err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Update email and trigger verification (auth required)
router.patch("/email", protect, async (req, res) => {
  const userId = req.user?.userID || req.user?.id;
  const { email } = req.body || {};

  if (!userId) {
    return res.status(401).json({ message: "Not authorized" });
  }
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: "Invalid email format" });
  }

  try {
    const now = Date.now();
    const editEntry = editLimit.get(userId);
    if (editEntry && editEntry.resetAt > now) {
      const retryIn = Math.ceil((editEntry.resetAt - now) / 1000);
      return res.status(429).json({ message: "Email change limit reached. Try again later.", retryInSeconds: retryIn, resetAt: editEntry.resetAt });
    }

    // Check if email already in use by another account
    const dup = await pool.query(
      `SELECT 1 FROM "Users" WHERE "Email" = $1 AND "UserID" <> $2`,
      [email, userId]
    );
    if (dup.rowCount > 0) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const updated = await pool.query(
      `UPDATE "Users"
          SET "Email" = $1,
              email_verified = false,
              verification_token = NULL,
              token_expires_at = NULL
        WHERE "UserID" = $2
        RETURNING "UserID", "Email", email_verified`,
      [email, userId]
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Trigger verification email (non-blocking try/catch)
    try {
      await sendVerificationEmail(userId, email);
    } catch (e) {
      console.warn("[email/update] Failed to send verification email:", e && e.message ? e.message : e);
    }

    // Set edit window
    editLimit.set(userId, { resetAt: now + EDIT_WINDOW_MS });

    return res.json({
      message: "Email updated. Verification sent to the new address.",
      user: {
        userID: updated.rows[0].UserID,
        email: updated.rows[0].Email,
        email_verified: updated.rows[0].email_verified,
      },
    });
  } catch (error) {
    console.error("[email/update] error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Change password with current password (auth required)
router.post("/password", protect, async (req, res) => {
  const userId = req.user?.userID || req.user?.id;
  const { currentPassword, newPassword, confirmPassword } = req.body || {};

  if (!userId) return res.status(401).json({ message: "Not authorized" });
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Current and new passwords are required." });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }
  if (confirmPassword && confirmPassword !== newPassword) {
    return res.status(400).json({ message: "Passwords do not match." });
  }

  const key = userId;
  const now = Date.now();
  const entry = passwordChangeLimit.get(key);
  if (entry && entry.resetAt > now) {
    if (entry.count >= PASSWORD_MAX_ATTEMPTS) {
      const retryIn = Math.ceil((entry.resetAt - now) / 1000);
      return res.status(429).json({ message: "Too many attempts. Try again soon.", retryInSeconds: retryIn });
    }
    entry.count += 1;
    passwordChangeLimit.set(key, entry);
  } else {
    passwordChangeLimit.set(key, { count: 1, resetAt: now + PASSWORD_WINDOW_MS });
  }

  try {
    const user = await pool.query(`SELECT "PasswordHash" FROM "Users" WHERE "UserID" = $1`, [userId]);
    if (user.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const matches = await bcrypt.compare(currentPassword, user.rows[0].PasswordHash);
    if (!matches) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE "Users" SET "PasswordHash" = $1 WHERE "UserID" = $2`,
      [hashed, userId]
    );

    return res.json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("[auth/password] error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;  
