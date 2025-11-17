const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ROUTES
const authRoutes = require("./routes/authRoutes");
app.use("/auth", authRoutes);

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
});
