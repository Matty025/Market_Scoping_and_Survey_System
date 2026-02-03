const crypto = require("crypto");
const pool = require("../db");

// Persist pre-verification tokens to Postgres so they survive restarts/serverless cold starts.
const PREVERIFY_EXP_MS = 24 * 60 * 60 * 1000; // 24h
let tableReadyPromise;

const ensureTable = async () => {
  if (!tableReadyPromise) {
    tableReadyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS "PreverifyTokens" (
        "Token" UUID PRIMARY KEY,
        "Email" TEXT NOT NULL,
        "Verified" BOOLEAN NOT NULL DEFAULT FALSE,
        "ExpiresAt" TIMESTAMPTZ NOT NULL,
        "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
  return tableReadyPromise;
};

const createEntry = async (email) => {
  await ensureTable();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + PREVERIFY_EXP_MS);

  // Clean any expired rows for this email to keep the table small.
  await pool.query('DELETE FROM "PreverifyTokens" WHERE "Email" = $1 AND "ExpiresAt" < NOW()', [email]);

  await pool.query(
    'INSERT INTO "PreverifyTokens" ("Token", "Email", "ExpiresAt", "Verified") VALUES ($1, $2, $3, $4)',
    [token, email, expiresAt.toISOString(), false]
  );

  return { token, expiresAt: expiresAt.getTime() };
};

const markVerified = async (token) => {
  await ensureTable();
  const { rows } = await pool.query(
    'UPDATE "PreverifyTokens" SET "Verified" = TRUE WHERE "Token" = $1 AND "ExpiresAt" > NOW() RETURNING "Email", "ExpiresAt", "Verified"',
    [token]
  );
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  return {
    email: row.Email,
    expiresAt: new Date(row.ExpiresAt).getTime(),
    verified: row.Verified,
  };
};

const getStatus = async (token) => {
  await ensureTable();
  const { rows } = await pool.query(
    'SELECT "Email", "ExpiresAt", "Verified" FROM "PreverifyTokens" WHERE "Token" = $1',
    [token]
  );
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const expiresMs = new Date(row.ExpiresAt).getTime();
  if (expiresMs < Date.now()) {
    await pool.query('DELETE FROM "PreverifyTokens" WHERE "Token" = $1', [token]);
    return null;
  }
  return {
    email: row.Email,
    expiresAt: expiresMs,
    verified: row.Verified,
  };
};

const requireVerified = async (email, token) => {
  const entry = await getStatus(token);
  if (!entry) return { ok: false, reason: "invalid" };
  if (entry.email.toLowerCase() !== email.toLowerCase()) return { ok: false, reason: "mismatch" };
  if (!entry.verified) return { ok: false, reason: "unverified" };
  return { ok: true };
};

module.exports = {
  createEntry,
  markVerified,
  getStatus,
  requireVerified,
};
