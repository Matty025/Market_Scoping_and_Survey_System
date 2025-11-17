const pool = require("../db");

module.exports = {
  // CREATE ADMIN / BUYER USER
  createUser: async (FullName, Email, PasswordHash, RoleID) => {
    const result = await pool.query(
      `INSERT INTO "Users" ("FullName", "Email", "PasswordHash", "RoleID")
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [FullName, Email, PasswordHash, RoleID]
    );

    return result.rows[0];
  },

  // CREATE SUPPLIER USER
  createSupplierUser: async (FullName, Email, PasswordHash, RoleID, SupplierID) => {
    const result = await pool.query(
      `INSERT INTO "Users" ("FullName", "Email", "PasswordHash", "RoleID", "SupplierID")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [FullName, Email, PasswordHash, RoleID, SupplierID]
    );

    return result.rows[0];
  },

  // FIND USER FOR LOGIN
  findByEmail: async (Email) => {
    const result = await pool.query(
      `SELECT u.*, r."RoleName", s."CompanyName"
       FROM "Users" u
       LEFT JOIN "Roles" r ON r."RoleID" = u."RoleID"
       LEFT JOIN "Suppliers" s ON s."SupplierID" = u."SupplierID"
       WHERE u."Email" = $1`,
      [Email]
    );

    return result.rows[0];
  }
};
