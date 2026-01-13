if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");
const pool = require("./db.js");
const { sendVerificationEmail } = require("./services/emailVerificationService");
const { verifyEmailToken } = require("./services/emailVerifyConsume");

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

    await sendVerificationEmail(userId, email);
    return res.json({ message: "Verification email sent" });
  } catch (err) {
    console.error("[/api/email/verify] Failed to send email:", err);
    return res.status(500).json({ error: "Failed to send verification email" });
  }
});

// Resend verification email (prefers authenticated user but falls back to body if needed)
app.post("/auth/resend-verification", async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId;
    const email = req.user?.email || req.body?.email;

    if (!userId || !email) {
      return res.status(400).json({ error: "Missing user" });
    }

    await sendVerificationEmail(userId, email);
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