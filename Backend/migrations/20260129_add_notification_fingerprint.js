const pool = require('../db');

(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting migration: add fingerprint to Notifications');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE "Notifications"
        ADD COLUMN IF NOT EXISTS "Fingerprint" TEXT;
    `);

    await client.query(`
      UPDATE "Notifications"
         SET "Fingerprint" = COALESCE(
           "Fingerprint",
           CONCAT(
             COALESCE(CAST("UserID" AS TEXT), ''), ':',
             COALESCE("Type", ''), ':',
             COALESCE(("Metadata"->>'sourceId'), ''), ':',
             COALESCE(("Metadata"->>'status'), ''), ':',
             COALESCE("Title", '')
           )
         )
      WHERE "Fingerprint" IS NULL;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'uq_notifications_fingerprint'
            AND n.nspname = 'public'
        ) THEN
          CREATE UNIQUE INDEX uq_notifications_fingerprint
            ON "Notifications" ("Fingerprint")
            WHERE "Fingerprint" IS NOT NULL;
        END IF;
      END$$;
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
