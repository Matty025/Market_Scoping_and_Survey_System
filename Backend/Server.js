if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");
const pool = require("./db.js");
const { notifyAdminsStatusChange, notifySuppliersStatusChange } = require("./services/announcementNotificationService");
const emailVerificationService = require("./services/emailVerificationService");
const { verifyEmailToken } = require("./services/emailVerifyConsume");
const preverifyStore = require("./services/preverifyStore");
const sendVerificationEmail = emailVerificationService?.sendVerificationEmail || emailVerificationService;
const sendPreRegistrationEmail = emailVerificationService?.sendPreRegistrationEmail;

// Simple in-memory cooldown map (per process). For multi-instance deployments, move to Redis/DB.
const verificationCooldown = new Map();
const COOLDOWN_MS = 60 * 1000; // 1 minute
const verificationDaily = new Map();
const DAILY_LIMIT = 5; // max sends per 24h
const preverifyCooldown = new Map();
const PRE_COOLDOWN_MS = 60 * 1000;

const app = express();

// ✅ FIXED: Allow multiple origins (local + deployed frontend)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://msss-2pxo.vercel.app", // ✅ frontend
  "https://msss.vercel.app",      // optional if same-domain calls
  process.env.FRONTEND_ORIGIN // Your deployed frontend URL from env
].filter(Boolean); // Remove any undefined values

const allowCredentials = process.env.CORS_ALLOW_CREDENTIALS === "true";

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn(`[CORS] Blocked origin: ${origin}`);
      return callback(null, false); // IMPORTANT
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.header("Access-Control-Allow-Credentials", "true");
    return res.sendStatus(200);
  }
  next();
});


console.log(`[CORS] Configured. Allowed origins:`, allowedOrigins);

app.use(express.json());

// Global request logger
app.use((req, res, next) => {
  const hasCookie = Boolean(req.headers.cookie);
  console.log(
    `[REQ] ${req.method} ${req.originalUrl} - Origin: ${
      req.headers.origin || "<none>"
    } - Cookie: ${hasCookie ? "yes" : "no"}`
  );
  next();
});

// ROUTES
const authRoutes = require("./routes/authRoutes");
app.use("/auth", (req, res, next) => {
  console.log(
    `Incoming ${req.method} request to /auth${req.url} - Origin: ${
      req.headers.origin || "<none>"
    }`
  );
  next();
}, authRoutes);

// Pre-registration email verification (no user account yet)
app.post("/auth/pre-verify/send", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Missing email" });

    const emailNorm = String(email).trim().toLowerCase();
    if (!/.+@.+\..+/.test(emailNorm)) return res.status(400).json({ error: "Invalid email" });

    const key = emailNorm;
    const now = Date.now();

    const last = preverifyCooldown.get(key) || 0;
    if (now - last < PRE_COOLDOWN_MS) {
      const retryIn = Math.ceil((PRE_COOLDOWN_MS - (now - last)) / 1000);
      return res.status(429).json({ error: `Please wait ${retryIn}s before resending.`, retryInSeconds: retryIn });
    }

    const { token, expiresAt } = preverifyStore.createEntry(emailNorm);
    preverifyCooldown.set(key, now);

    if (typeof sendPreRegistrationEmail === "function") {
      await sendPreRegistrationEmail(emailNorm, token);
    } else {
      console.warn("sendPreRegistrationEmail not available; skipping send");
    }

    return res.json({ message: "Verification email sent", preToken: token, expiresAt });
  } catch (err) {
    console.error("[pre-verify/send]", err);
    return res.status(500).json({ error: "Failed to send verification email" });
  }
});

app.get("/auth/pre-verify/status", (req, res) => {
  try {
    const { token } = req.query || {};
    if (!token) return res.status(400).json({ error: "Missing token" });
    const status = preverifyStore.getStatus(token);
    if (!status) return res.status(400).json({ error: "Invalid or expired token" });
    return res.json({ email: status.email, verified: status.verified, expiresAt: status.expiresAt });
  } catch (err) {
    console.error("[pre-verify/status]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

app.get("/auth/pre-verify/consume", (req, res) => {
  try {
    const { token } = req.query || {};
    if (!token) return res.status(400).json({ error: "Missing token" });
    const result = preverifyStore.markVerified(token);
    if (!result) return res.status(400).json({ error: "Invalid or expired token" });
    return res.json({ message: "Email verified", email: result.email });
  } catch (err) {
    console.error("[pre-verify/consume]", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

// Send verification email (expects userId and email in body; protect in auth layer if available)
app.post("/auth/send-verification", async (req, res) => {
  try {
    const { userId, email } = req.body || {};

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing userId or email" });
    }

    await sendVerificationEmail(userId, email);
    return res.json({ message: "Verification email sent" });
  } catch (err) {
    console.error("[send-verification] Failed to send email:", err);
    return res.status(500).json({ error: "Failed to send verification email" });
  }
});

// Alias: send verification from profile (matches POST /api/email/verify in frontend example)
app.post("/api/email/verify", async (req, res) => {
  try {
    const { userId, email } = req.body || {};

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing userId or email" });
    }

    const key = `${userId}:${email}`;
    const now = Date.now();

    // Cooldown check
    const last = verificationCooldown.get(key) || 0;
    if (now - last < COOLDOWN_MS) {
      const retryIn = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return res.status(429).json({ error: `Please wait ${retryIn}s before resending.`, retryInSeconds: retryIn });
    }

    // Daily cap check
    const daily = verificationDaily.get(key);
    if (daily && daily.resetAt > now && daily.count >= DAILY_LIMIT) {
      const retryIn = Math.ceil((daily.resetAt - now) / 1000);
      return res.status(429).json({ error: "Daily verification limit reached. Try again later.", retryInSeconds: retryIn, resetAt: daily.resetAt });
    }

    await sendVerificationEmail(userId, email);

    // update cooldown
    verificationCooldown.set(key, now);
    // update daily counter
    if (!daily || daily.resetAt <= now) {
      verificationDaily.set(key, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    } else {
      verificationDaily.set(key, { count: daily.count + 1, resetAt: daily.resetAt });
    }
    return res.json({ message: "Verification email sent" });
  } catch (err) {
    console.error("[/api/email/verify] Failed to send email:", err);
    return res.status(500).json({ error: "Failed to send verification email" });
  }
});

// Resend verification email (prefers authenticated user but falls back to body if needed)
app.post("/auth/resend-verification", async (req, res) => {
  try {
    const userId = req.user?.userID || req.user?.id || req.body?.userId;
    const email = req.user?.email || req.body?.email;

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing user" });
    }

    const key = `${userId}:${email}`;
    const now = Date.now();

    // Cooldown check
    const last = verificationCooldown.get(key) || 0;
    if (now - last < COOLDOWN_MS) {
      const retryIn = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return res.status(429).json({ error: `Please wait ${retryIn}s before resending.`, retryInSeconds: retryIn });
    }

    // Daily cap check
    const daily = verificationDaily.get(key);
    if (daily && daily.resetAt > now && daily.count >= DAILY_LIMIT) {
      const retryIn = Math.ceil((daily.resetAt - now) / 1000);
      return res.status(429).json({ error: "Daily verification limit reached. Try again later.", retryInSeconds: retryIn, resetAt: daily.resetAt });
    }

    await sendVerificationEmail(userId, email);

    verificationCooldown.set(key, now);
    if (!daily || daily.resetAt <= now) {
      verificationDaily.set(key, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    } else {
      verificationDaily.set(key, { count: daily.count + 1, resetAt: daily.resetAt });
    }
    return res.json({ message: "Verification email sent" });
  } catch (err) {
    console.error("[resend-verification] Failed to send email:", err);
    return res.status(500).json({ error: "Failed to send verification email" });
  }
});

// Verify email token and mark user as verified
app.get("/auth/verify", async (req, res) => {
  try {
    const { token } = req.query || {};
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const result = await verifyEmailToken(token);

    if (result.status === "expired") {
      return res.status(400).json({ error: "Token expired" });
    }

    if (result.status === "invalid") {
      return res.status(400).json({ error: "Invalid token" });
    }

    return res.json({ message: "Email verified" });
  } catch (err) {
    console.error("[verify-email] Verification failed:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

// Alias: token verification via path param (matches GET /api/email/verify/:token)
app.get("/api/email/verify/:token", async (req, res) => {
  try {
    const { token } = req.params || {};
    if (!token) {
      return res.status(400).send("Missing token");
    }

    const result = await verifyEmailToken(token);

    if (result.status === "expired") {
      return res.status(400).send("Invalid or expired verification link");
    }

    if (result.status === "invalid") {
      return res.status(400).send("Invalid or expired verification link");
    }

    return res.send("Email verified successfully ✅");
  } catch (err) {
    console.error("[/api/email/verify/:token] Verification failed:", err);
    return res.status(500).send("Verification failed");
  }
});

const supplierRoutes = require("./routes/SupplierRoutes");
console.log("[Server.js] supplierRoutes loaded.");
app.use("/api/supplier-files", (req, res, next) => {
  console.log(`[Server.js] Incoming request to /api/supplier-files. Method: ${req.method}`);
  next();
}, supplierRoutes);

const adminRoutes = require("./routes/adminRoutes");
console.log("[Server.js] adminRoutes loaded.");
app.use("/api/admin", adminRoutes);

const dashboardRoutes = require("./routes/dashboardRoutes");
console.log("[Server.js] dashboardRoutes loaded.");
app.use("/api/dashboard", dashboardRoutes);

const responseRoutes = require("./routes/responseRoutes");
console.log("[Server.js] responseRoutes loaded.");
app.use("/api/supplier-responses", responseRoutes);

const publicRoutes = require("./routes/publicRoutes");
console.log("[Server.js] publicRoutes loaded.");
app.use("/api/public", publicRoutes);

const buyerRoutes = require("./routes/BuyerRoutes");
console.log("[Server.js] buyerRoutes loaded.");
app.use("/api/buyer", buyerRoutes);

const reportRoutes = require("./routes/reportRoutes");
console.log("[Server.js] reportRoutes loaded.");
app.use("/api/reports", reportRoutes);

const fileRoutes = require("./routes/fileRoutes");
console.log("[Server.js] fileRoutes loaded.");
app.use("/api/files", fileRoutes);

// --- Auto-fail postings that lapse after their end date (Asia/Singapore) ---
const EXPIRY_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const AUTO_FAIL_NOTES = "Auto-failed: End date passed in Asia/Singapore at 12:00 AM.";
let autoFailSweepRunning = false;

const getSupplierIdsForFile = async (client, fileId) => {
  const targetId = Number(fileId);
  if (!client || !Number.isInteger(targetId)) return [];
  const { rows } = await client.query(
    'SELECT DISTINCT "SupplierID" FROM "SupplierFiles" WHERE "FileID" = $1',
    [targetId]
  );
  return rows.map((r) => Number(r.SupplierID)).filter((id) => Number.isInteger(id));
};

const autoFailExpiredAnnouncements = async () => {
  if (autoFailSweepRunning) {
    return;
  }
  autoFailSweepRunning = true;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: expiredRows } = await client.query(`
      SELECT pf."FileID", pf."Title", pf."Status", pf."EndDate"
        FROM "ProcurementFiles" pf
       WHERE pf."Status" NOT IN ('COMPLETED', 'FAILED_POSTING')
         AND pf."EndDate" IS NOT NULL
         AND pf."EndDate"::date < ((NOW() AT TIME ZONE 'Asia/Singapore')::date)
       FOR UPDATE
    `);

    if (expiredRows.length === 0) {
      await client.query("COMMIT");
      return;
    }

    const notifications = [];

    for (const row of expiredRows) {
      await client.query('UPDATE "ProcurementFiles" SET "Status" = $1 WHERE "FileID" = $2', ['FAILED_POSTING', row.FileID]);

      await client.query(
        `INSERT INTO "ProcurementStatusHistory" ("FileID", "OldStatus", "NewStatus", "ChangedBy", "Notes")
         VALUES ($1, $2, $3, NULL, $4)`,
        [row.FileID, row.Status || null, 'FAILED_POSTING', AUTO_FAIL_NOTES]
      );

      await client.query(
        'UPDATE "SupplierFiles" SET "Status" = $1 WHERE "FileID" = $2 AND "Status" <> $3',
        ['FAILED_POSTING', row.FileID, 'ANSWERED']
      );

      const supplierIds = await getSupplierIdsForFile(client, row.FileID);
      notifications.push({
        fileId: row.FileID,
        title: row.Title,
        previousStatus: row.Status,
        supplierIds,
      });
    }

    await client.query("COMMIT");

    for (const note of notifications) {
      notifyAdminsStatusChange({
        fileId: note.fileId,
        title: note.title || `Announcement ${note.fileId}`,
        status: 'FAILED_POSTING',
        previousStatus: note.previousStatus,
        notes: AUTO_FAIL_NOTES,
      }).catch((err) => {
        console.warn('[auto-fail] Admin notification failed:', err && err.message ? err.message : err);
      });

      if (note.supplierIds && note.supplierIds.length > 0) {
        notifySuppliersStatusChange({
          fileId: note.fileId,
          title: note.title || `Announcement ${note.fileId}`,
          status: 'FAILED_POSTING',
          previousStatus: note.previousStatus,
          notes: AUTO_FAIL_NOTES,
          supplierIds: note.supplierIds,
        }).catch((err) => {
          console.warn('[auto-fail] Supplier notification failed:', err && err.message ? err.message : err);
        });
      }
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error('[auto-fail] Sweep failed:', err && err.message ? err.message : err);
  } finally {
    client.release();
    autoFailSweepRunning = false;
  }
};

if (!process.env.VERCEL) {
  setInterval(() => {
    autoFailExpiredAnnouncements().catch((err) => console.warn('[auto-fail] Sweep error:', err));
  }, EXPIRY_SWEEP_INTERVAL_MS);

  setTimeout(() => {
    autoFailExpiredAnnouncements().catch((err) => console.warn('[auto-fail] Initial sweep error:', err));
  }, 15 * 1000);
}

// Lightweight health endpoint for container healthchecks
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('[Health] DB check failed:', err && err.message ? err.message : err);
    return res.status(503).json({ status: 'error', db: 'unreachable', error: String(err && err.message ? err.message : err) });
  }
});

// Check DB connection (non-fatal) and start server
const startServer = async () => {
  try {
    const client = await pool.connect();
    console.log(`✅ Connected to database: ${client.database}`);
    client.release();
  } catch (err) {
    console.error("⚠️ Failed to connect to the database at startup. Continuing to serve; check /health.", err);
  }

  const PORT = Number(process.env.PORT || process.env.APP_PORT || 3000);
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("[Server.js] All routes configured.");
  });
};

// In Vercel serverless we export the app; only start listener when not on Vercel
if (!process.env.VERCEL) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;