const pool = require('../db');

(async () => {
  const client = await pool.connect();
  try {
    console.log('Starting migration: add attempt metadata to SupplierFiles and SupplierResponses');
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE "SupplierFiles"
        ADD COLUMN IF NOT EXISTS "CurrentAttemptNumber" INT NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "OptInStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        ADD COLUMN IF NOT EXISTS "OptedInAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "DeclinedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "ReuseResponseID" INT,
        ADD COLUMN IF NOT EXISTS "LastReusedAt" TIMESTAMP;
    `);

    await client.query(`
      ALTER TABLE "SupplierResponses"
        ADD COLUMN IF NOT EXISTS "IsReused" BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "SourceResponseID" INT;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'SupplierResponses_SourceResponseID_fkey'
            AND table_name = 'SupplierResponses'
        ) THEN
          ALTER TABLE "SupplierResponses"
            ADD CONSTRAINT "SupplierResponses_SourceResponseID_fkey"
            FOREIGN KEY ("SourceResponseID")
            REFERENCES "SupplierResponses" ("ResponseID")
            ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'SupplierFiles_ReuseResponseID_fkey'
            AND table_name = 'SupplierFiles'
        ) THEN
          ALTER TABLE "SupplierFiles"
            ADD CONSTRAINT "SupplierFiles_ReuseResponseID_fkey"
            FOREIGN KEY ("ReuseResponseID")
            REFERENCES "SupplierResponses" ("ResponseID")
            ON DELETE SET NULL;
        END IF;
      END$$;
    `);

    await client.query(`
      WITH attempt_totals AS (
        SELECT
          pf."FileID",
          GREATEST(1, COUNT(*) FILTER (WHERE h."NewStatus" = 'ACTIVE')) AS attempt_count
        FROM "ProcurementFiles" pf
        LEFT JOIN "ProcurementStatusHistory" h ON h."FileID" = pf."FileID"
        GROUP BY pf."FileID"
      )
      UPDATE "SupplierFiles" sf
      SET "CurrentAttemptNumber" = GREATEST(attempt_totals.attempt_count, 1)
      FROM attempt_totals
      WHERE sf."FileID" = attempt_totals."FileID";
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
