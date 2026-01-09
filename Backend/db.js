const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set.");
  throw new Error("DATABASE_URL missing");
}

// ✅ Cache the pool for serverless (IMPORTANT on Vercel)
let pool;

if (!global._pgPool) {
  global._pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  global._pgPool.on("connect", () => {
    console.log("✅ Connected to PostgreSQL (Supabase)");
  });

  global._pgPool.on("error", (err) => {
    console.error("❌ PostgreSQL error", err);
  });
}

pool = global._pgPool;

module.exports = pool;
