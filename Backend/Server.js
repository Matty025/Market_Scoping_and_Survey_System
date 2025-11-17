const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const allowedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
console.log(`[CORS] Configured. Allowed origin: ${allowedOrigin}`);
// Explicitly handle preflight
app.options("*", cors({ origin: allowedOrigin, credentials: true }), (req, res) => {
  console.log(`[CORS] Preflight ${req.method} ${req.originalUrl} - Origin: ${req.headers.origin}`);
  res.sendStatus(204);
});
app.use(express.json());

// Global request logger
app.use((req, res, next) => {
  const hasCookie = Boolean(req.headers.cookie);
  console.log(`[REQ] ${req.method} ${req.originalUrl} - Origin: ${req.headers.origin || "<none>"} - Cookie: ${hasCookie ? "yes" : "no"}`);
  next();
});

// ROUTES
const authRoutes = require("./routes/authRoutes");
app.use("/auth", (req, res, next) => {
  console.log(`Incoming ${req.method} request to /auth${req.url} - Origin: ${req.headers.origin || "<none>"}`);
  next();
}, authRoutes);

// Supplier routes
const SupplierRoutes = require("./routes/SupplierRoutes");
console.log("SupplierRoutes loaded:", SupplierRoutes);

// Log every request to /suppliers for debugging
app.use("/suppliers", (req, res, next) => {
  console.log(`Incoming ${req.method} request to /suppliers${req.url}`);
  next();
}, SupplierRoutes);

// Server running
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`[ENV] FRONTEND_ORIGIN=${process.env.FRONTEND_ORIGIN || "(not set)"}`);
});
