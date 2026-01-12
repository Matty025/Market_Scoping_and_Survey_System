if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");
const pool = require("./db.js");

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

app.options("*", cors()); // 🔥 REQUIRED

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