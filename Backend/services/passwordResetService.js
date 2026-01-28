const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const db = require('../db');
const mailer = require('../utils/mailer');

// Resolve sendMail similarly to other services for resilience
const sendMail =
  (mailer && typeof mailer.sendMail === 'function' && mailer.sendMail)
  || (mailer && typeof mailer === 'function' && mailer)
  || (mailer && typeof mailer.default === 'function' && mailer.default)
  || (mailer && mailer.transporter && typeof mailer.transporter.sendMail === 'function' && ((opts) => mailer.transporter.sendMail(opts)))
  || (() => {
    const user = process.env.SYSTEM_EMAIL;
    const pass = process.env.SYSTEM_EMAIL_APP_PASSWORD;
    if (!user || !pass) return null;
    const fallbackTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    return (options = {}) => {
      const base = { from: `"MSSS" <${user}>` };
      return fallbackTransporter.sendMail({ ...base, ...options });
    };
  })();

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const buildResetLink = (baseUrl, token) => {
  if (!baseUrl) return null;
  const trimmed = baseUrl.replace(/\/$/, '');
  return `${trimmed}/reset-password?token=${encodeURIComponent(token)}`;
};

async function requestPasswordReset(email, { baseUrl, expiresMinutes = 60 } = {}) {
  if (!email) return { ok: false, message: 'Email is required' };

  const userRes = await db.query(
    'SELECT "UserID", "Email", "FullName" FROM "Users" WHERE LOWER("Email") = LOWER($1)',
    [email]
  );

  // Always return ok to avoid email enumeration
  if (userRes.rowCount === 0) return { ok: true, sent: false };

  const user = userRes.rows[0];
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

  await db.query(
    'INSERT INTO "PasswordResetTokens" ("UserID", "TokenHash", "ExpiresAt") VALUES ($1, $2, $3)',
    [user.UserID, tokenHash, expiresAt]
  );

  const resetLink = buildResetLink(baseUrl, rawToken);

  if (sendMail && resetLink) {
    try {
      await sendMail({
        to: user.Email,
        subject: '[MSSS] Reset your password',
        html: `
          <h3>Password reset requested</h3>
          <p>Hello ${user.FullName || 'there'},</p>
          <p>We received a request to reset your password. Click the button below to choose a new one.</p>
          <p><a href="${resetLink}" style="padding:10px 16px; background:#1f7ae0; color:#fff; text-decoration:none; border-radius:6px;">Reset Password</a></p>
          <p>If you did not request this, you can ignore this email. This link expires in ${expiresMinutes} minutes.</p>
        `,
      });
    } catch (err) {
      console.warn('[passwordReset] Failed to send reset email:', err && err.message ? err.message : err);
    }
  }

  return { ok: true, sent: true };
}

async function resetPasswordWithToken(rawToken, newPassword) {
  if (!rawToken || !newPassword) return { ok: false, code: 'invalid' };
  const tokenHash = hashToken(rawToken);
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT t."ResetTokenID", t."UserID", t."ExpiresAt", t."UsedAt"
         FROM "PasswordResetTokens" t
        WHERE t."TokenHash" = $1
        FOR UPDATE`,
      [tokenHash]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'invalid' };
    }

    const tokenRow = rows[0];
    const now = new Date();
    if (tokenRow.UsedAt || new Date(tokenRow.ExpiresAt) < now) {
      await client.query('ROLLBACK');
      return { ok: false, code: 'expired' };
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await client.query(
      'UPDATE "Users" SET "PasswordHash" = $1 WHERE "UserID" = $2',
      [passwordHash, tokenRow.UserID]
    );

    await client.query(
      'UPDATE "PasswordResetTokens" SET "UsedAt" = NOW() WHERE "ResetTokenID" = $1',
      [tokenRow.ResetTokenID]
    );

    // Invalidate other active tokens for this user
    await client.query(
      'UPDATE "PasswordResetTokens" SET "UsedAt" = COALESCE("UsedAt", NOW()) WHERE "UserID" = $1 AND "ResetTokenID" <> $2 AND "UsedAt" IS NULL',
      [tokenRow.UserID, tokenRow.ResetTokenID]
    );

    await client.query('COMMIT');
    return { ok: true, userId: tokenRow.UserID };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  requestPasswordReset,
  resetPasswordWithToken,
};
