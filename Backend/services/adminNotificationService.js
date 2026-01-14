const db = require("../db");
const { sendMail } = require("../utils/mailer");

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

async function sendPendingAccountEmail({ fullName, email, role, companyName }) {
  try {
    const recipients = await getAdminEmails();
    if (!recipients.length) return;

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
  } catch (err) {
    console.warn("[adminNotification] Failed to send pending account email:", err && err.message ? err.message : err);
  }
}

module.exports = { sendPendingAccountEmail };
