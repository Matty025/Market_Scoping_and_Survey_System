const express = require("express");
const cors = require("cors");
const pool = require("./db.js"); // Import the database pool
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const app = express();

const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

console.log(`[CORS] Configured. Allowed origin: ${allowedOrigin}`);

// ❌ REMOVE ANY app.options() ROUTE — EXPRESS v5 breaks completely

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

// --- Ensure required directories exist ---
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  console.log(`[Server.js] 'uploads' directory not found. Creating...`);
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// --- Serve static files from specific sub-directories ---
// This is the key change: It maps the URL '/uploads/buyer-pr' to the correct physical directory.
const buyerPrUploadsDir = path.join(uploadsDir, 'buyer-pr');
app.use('/uploads/buyer-pr', express.static(buyerPrUploadsDir));
console.log(`[Static] Serving files from ${buyerPrUploadsDir} at /uploads/buyer-pr`);

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

const supplierRoutes = require("./routes/SupplierRoutes"); // Corrected: Ensure this path is correct, matching file casing
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

// Check DB connection and start server
const startServer = async () => {
  try {
    const client = await pool.connect();
    console.log(`✅ Connected to database: ${client.database}`);
    client.release();

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log("[Server.js] All routes configured.");
    });
  } catch (err) {
    console.error("❌ Failed to connect to the database. Server not started.", err);
    process.exit(1);
  }
};

startServer();
