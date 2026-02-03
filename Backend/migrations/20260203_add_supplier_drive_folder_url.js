const pool = require('../db');

(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting migration: add DriveFolderUrl to Suppliers');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE "Suppliers"
      ADD COLUMN IF NOT EXISTS "DriveFolderUrl" TEXT;
    `);

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