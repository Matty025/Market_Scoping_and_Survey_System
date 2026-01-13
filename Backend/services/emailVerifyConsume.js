const pool = require("../db");

async function verifyEmailToken(token) {
  const lookup = await pool.query(
    `SELECT "UserID" AS id, email_verified, token_expires_at
       FROM "Users"
      WHERE verification_token = $1`,
    [token]
  );

  if (lookup.rowCount === 0) {
    return { status: "invalid" };
  }

  const user = lookup.rows[0];
  const expiresAt = user.token_expires_at ? new Date(user.token_expires_at) : null;
  const now = new Date();

  if (!expiresAt || expiresAt.getTime() < now.getTime()) {
    return { status: "expired" };
  }

  // Clear token and mark verified (even if already verified, clear stale token)
  await pool.query(
    `UPDATE "Users"
        SET email_verified = true,
            verification_token = NULL,
            token_expires_at = NULL
      WHERE "UserID" = $1`,
    [user.id]
  );

  return { status: "ok", userId: user.id };
}

module.exports = { verifyEmailToken };
