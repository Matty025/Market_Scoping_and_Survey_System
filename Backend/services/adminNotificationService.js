const db = require("../db");
const mailer = require("../utils/mailer");

// Be robust to different export shapes (CommonJS vs default)
const sendMail =
  (mailer && typeof mailer.sendMail === "function" && mailer.sendMail)
  || (mailer && typeof mailer === "function" && mailer)
  || (mailer && typeof mailer.default === "function" && mailer.default)
  || (mailer && mailer.transporter && typeof mailer.transporter.sendMail === "function" && ((opts) => mailer.transporter.sendMail(opts)))
  || null;

async function getAdminEmails() {
  const { rows } = await db.query(
    `SELECT u."Email"
       FROM "Users" u
       JOIN "Roles" r ON r."RoleID" = u."RoleID"
      WHERE LOWER(r."RoleName") = 'admin'
        AND u."Email" IS NOT NULL`
  );
  return rows.map(r => r.Email).filter(Boolean);
}

async function sendPendingAccountEmail({ fullName, email, role, companyName, toOverride }) {
  try {
    if (!sendMail) {
      console.warn("[adminNotification] sendMail is not available; cannot send pending account email.");
      return;
    }

    const recipients = Array.isArray(toOverride)
      ? toOverride.filter(Boolean)
      : toOverride
        ? [toOverride]
        : await getAdminEmails();

    console.log(
      `[adminNotification] Pending account email target(s): ${
        recipients && recipients.length ? recipients.join(", ") : "<none>"
      }`
    );

    if (!recipients.length) {
      console.warn("[adminNotification] No admin recipients found; skipping pending account email.");
      return;
    }

    const roleLabel = (role || "account").toString().toLowerCase();
    const subject = `[MSSS] New ${roleLabel} pending approval`;
    const details = [
      `<strong>Name:</strong> ${fullName || "(not provided)"}`,
      `<strong>Email:</strong> ${email || "(not provided)"}`,
      `<strong>Role:</strong> ${roleLabel}`,
    ];
    if (companyName) details.push(`<strong>Company:</strong> ${companyName}`);

    await sendMail({
      to: recipients,
      subject,
      html: `
        <h3>New registration pending approval</h3>
        <p>The following user just registered and is awaiting review:</p>
        <p>${details.join("<br/>")}</p>
        <p>Please sign in to the admin console to approve, reject, or blacklist the account.</p>
      `,
    });

    console.log(
      `[adminNotification] Pending account email sent for ${email || fullName || "unknown user"}`
    );
  } catch (err) {
    console.warn("[adminNotification] Failed to send pending account email:", err && err.message ? err.message : err);
  }
}

module.exports = { sendPendingAccountEmail };
