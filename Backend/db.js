require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,       // 'SDOadmin'
  host: process.env.DB_HOST,       // 'msss.postgres.database.azure.com'
  database: process.env.DB_DATABASE, // 'mrsss'
  password: process.env.DB_PASSWORD, // 'MRSSS'
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false } // required for Azure
});

module.exports = pool;
