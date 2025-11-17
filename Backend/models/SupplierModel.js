const pool = require("../db");

const SupplierModel = {
  // CREATE SUPPLIER
  createSupplier: async (
    CompanyName,
    Address,
    ContactNumber,
    SDOLocation,
    HasPhilgeps = false,
    HasSECRegistration = false,
    HasBusinessPermit = false,
    HasTaxClearance = false
  ) => {
    const result = await pool.query(
      `INSERT INTO "Suppliers"
        ("CompanyName","Address","ContactNumber","SDOLocation","HasPhilgeps","HasSECRegistration","HasBusinessPermit","HasTaxClearance")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        CompanyName,
        Address,
        ContactNumber,
        SDOLocation,
        HasPhilgeps,
        HasSECRegistration,
        HasBusinessPermit,
        HasTaxClearance,
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
  updateSupplier: async (SupplierID, data) => {
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

    const result = await pool.query(
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
