const mailer = require("../utils/mailer");
const sendMail = mailer.sendMail || ((opts) => mailer.transporter.sendMail(opts));
const db = require("../db");
const crypto = require("crypto");

async function sendVerificationEmail(userId, email) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h; tweak as needed

  const result = await db.query(
    `UPDATE "Users"
       SET verification_token = $1,
           token_expires_at = $2
     WHERE "UserID" = $3
     RETURNING "UserID", email_verified`,
    [token, expiresAt, userId]
  );

  if (result.rowCount === 0) {
    throw new Error("User not found when issuing verification token");
  }

  // Optional: skip sending if already verified
  if (result.rows[0].email_verified) {
    return;
  }

  // Prefer query param; adjust if your frontend expects /verify-email/:token
  const base = process.env.FRONTEND_URL || process.env.FRONTEND_ORIGIN || "";
  const verifyLink = `${base}/verify-email?token=${token}`;

  await sendMail({
    to: email,
    subject: "Verify your email for MSSS notifications",
    html: `
      <h3>Email Verification</h3>
      <p>Please click the link below to verify your email:</p>
      <p><a href="${verifyLink}">Verify Email</a></p>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

module.exports = { sendVerificationEmail };