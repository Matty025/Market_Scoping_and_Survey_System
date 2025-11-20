const pool = require('../db');

(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting migration: create SupplierUploads table');
    await client.query('BEGIN');

    const createTable = `
      CREATE TABLE IF NOT EXISTS "SupplierUploads" (
        "UploadID" SERIAL PRIMARY KEY,
        "SupplierID" INT NOT NULL REFERENCES "Suppliers"("SupplierID") ON DELETE CASCADE,
        "FilePath" TEXT NOT NULL,
        "FileName" VARCHAR(255),
        "Status" VARCHAR(20) DEFAULT 'PENDING',
        "RowCount" INT DEFAULT 0,
        "CreatedAt" TIMESTAMP DEFAULT NOW(),
        "ProcessedAt" TIMESTAMP
      );
    `;

    await client.query(createTable);
    console.log('Ensured SupplierUploads table exists');

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
})();
