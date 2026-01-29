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

    // Resolve duplicates before creating a global unique index
    await client.query(`
      WITH dupes AS (
        SELECT "NotificationID", "Fingerprint",
               ROW_NUMBER() OVER (PARTITION BY "Fingerprint" ORDER BY "NotificationID") AS rn
        FROM "Notifications"
        WHERE "Fingerprint" IS NOT NULL
      )
      UPDATE "Notifications" n
         SET "Fingerprint" = n."Fingerprint" || ':' || gen_random_uuid()
      FROM dupes d
      WHERE n."NotificationID" = d."NotificationID"
        AND d.rn > 1;
    `);

    // Drop partial index if it exists, then create a full unique index usable by ON CONFLICT
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'uq_notifications_fingerprint'
            AND n.nspname = 'public'
        ) THEN
          DROP INDEX IF EXISTS uq_notifications_fingerprint;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'uq_notifications_fingerprint'
            AND n.nspname = 'public'
        ) THEN
          CREATE UNIQUE INDEX uq_notifications_fingerprint
            ON "Notifications" ("Fingerprint");
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
