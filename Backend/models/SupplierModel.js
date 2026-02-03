const pool = require("../db");

const SupplierModel = {
  // CREATE SUPPLIER
  createSupplier: async (
    CompanyName,
    Address,
    ContactNumber,
    HasPhilgeps = false,
    HasSECRegistration = false,
    HasBusinessPermit = false,
    HasTaxClearance = false,
    DriveFolderUrl = null,
    dbClient = null
  ) => {
    const runner = dbClient || pool;
    const result = await runner.query(
      `INSERT INTO "Suppliers"
        ("CompanyName","Address","ContactNumber","HasPhilgeps","HasSECRegistration","HasBusinessPermit","HasTaxClearance","DriveFolderUrl")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        CompanyName,
        Address,
        ContactNumber,
        HasPhilgeps,
        HasSECRegistration,
        HasBusinessPermit,
        HasTaxClearance,
        DriveFolderUrl,
      ]
    );

    return result.rows[0];
  },

  // FIND SUPPLIER BY ID
  findById: async (SupplierID) => {
    const result = await pool.query(
      `SELECT * FROM "Suppliers" WHERE "SupplierID" = $1`,
      [SupplierID]
    );
    return result.rows[0];
  },

  // UPDATE SUPPLIER
  updateSupplier: async (SupplierID, data, dbClient = null) => {
    const runner = dbClient || pool;
    const fields = [];
    const values = [];
    let index = 1;

    // Build dynamic query: "Key" = $1
    for (const key in data) {
      fields.push(`"${key}" = $${index}`);
      values.push(data[key]);
      index++;
    }

    values.push(SupplierID);

    const result = await runner.query(
      `UPDATE "Suppliers"
       SET ${fields.join(", ")}, "DateUpdated" = NOW()
       WHERE "SupplierID" = $${index}
       RETURNING *`,
      values
    );

    return result.rows[0];
  },
};

module.exports = SupplierModel;
