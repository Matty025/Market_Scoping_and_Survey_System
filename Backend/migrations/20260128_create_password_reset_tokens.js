const pool = require('../db');

(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting migration: create PasswordResetTokens table');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "PasswordResetTokens" (
        "ResetTokenID" SERIAL PRIMARY KEY,
        "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
        "TokenHash" VARCHAR(128) NOT NULL,
        "ExpiresAt" TIMESTAMP NOT NULL,
        "UsedAt" TIMESTAMP,
        "CreatedAt" TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetTokens_TokenHash_idx"
        ON "PasswordResetTokens" ("TokenHash");
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
