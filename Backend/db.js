/**
 * db.js
 * PostgreSQL connection for Supabase + Render
 */

require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL (Supabase)');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected PostgreSQL error', err);
  process.exit(1);
});

module.exports = pool;
