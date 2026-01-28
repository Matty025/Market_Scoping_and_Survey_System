const pool = require('../db');

(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting migration: create Notifications table');
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS "Notifications" (
        "NotificationID" SERIAL PRIMARY KEY,
        "UserID" INT NOT NULL REFERENCES "Users"("UserID") ON DELETE CASCADE,
        "Type" VARCHAR(50) NOT NULL,
        "Title" VARCHAR(255) NOT NULL,
        "Body" TEXT,
        "Metadata" JSONB,
        "IsRead" BOOLEAN NOT NULL DEFAULT FALSE,
        "CreatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        "UpdatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'idx_notifications_user_created'
            AND n.nspname = 'public'
        ) THEN
          CREATE INDEX idx_notifications_user_created
            ON "Notifications" ("UserID", "CreatedAt" DESC);
        END IF;
      END$$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'idx_notifications_user_unread'
            AND n.nspname = 'public'
        ) THEN
          CREATE INDEX idx_notifications_user_unread
            ON "Notifications" ("UserID", "IsRead")
            WHERE "IsRead" = false;
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
