const db = require("../db");
const nodemailer = require("nodemailer");
const mailer = require("../utils/mailer");

// Be robust to different export shapes (CommonJS vs default)
let sendMail =
  (mailer && typeof mailer.sendMail === "function" && mailer.sendMail)
  || (mailer && typeof mailer === "function" && mailer)
  || (mailer && typeof mailer.default === "function" && mailer.default)
  || (mailer && mailer.transporter && typeof mailer.transporter.sendMail === "function" && ((opts) => mailer.transporter.sendMail(opts)))
  || null;

// Local fallback if the shared mailer export shape fails in serverless bundling
if (!sendMail) {
  try {
    const user = process.env.SYSTEM_EMAIL;
    const pass = process.env.SYSTEM_EMAIL_APP_PASSWORD;
    if (!user || !pass) {
      console.warn("[adminNotification] Missing SYSTEM_EMAIL or SYSTEM_EMAIL_APP_PASSWORD; cannot build fallback transporter.");
    } else {
      const fallbackTransporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user, pass },
      });
      sendMail = (options = {}) => {
        const base = { from: `"MSSS" <${user}>` };
        return fallbackTransporter.sendMail({ ...base, ...options });
      };
      console.log("[adminNotification] Using local nodemailer fallback transporter for pending-account emails.");
    }
  } catch (err) {
    console.warn("[adminNotification] Failed to init fallback transporter:", err && err.message ? err.message : err);
  }
}

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

const formatStatusLabel = (status) => {
  if (!status) return "Unknown";
  return String(status)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
};

async function sendAccountStatusEmail({ email, fullName, status, notes }) {
  if (!email || !sendMail) {
    console.warn("[adminNotification] Missing email or sendMail unavailable; skipping account status email.");
    return;
  }

  const statusLabel = formatStatusLabel(status);
  const bodyNote = (notes && notes.toString().trim().length > 0)
    ? notes.toString().trim()
    : "No additional notes were provided.";

  const safeName = fullName || "Supplier";

  await sendMail({
    to: email,
    subject: `[MSSS] Account Status Updated: ${statusLabel}`,
    html: `
      <h3>Hello ${safeName},</h3>
      <p>Your account status was updated to <strong>${statusLabel}</strong>.</p>
      <p><strong>Notes from the admin team:</strong></p>
      <p>${bodyNote.replace(/\n/g, "<br/>")}</p>
      <p>If you have any questions, reply directly to this email.</p>
    `,
  });

  console.log(`[adminNotification] Account status email sent to ${email} for status ${statusLabel}`);
}

module.exports.sendAccountStatusEmail = sendAccountStatusEmail;

async function sendSupplierResponseEmail({ supplierName, companyName, fileTitle, fileId, toOverride }) {
  if (!sendMail) {
    console.warn("[adminNotification] sendMail is not available; cannot send supplier response email.");
    return;
  }

  const recipients = Array.isArray(toOverride)
    ? toOverride.filter(Boolean)
    : toOverride
      ? [toOverride]
      : await getAdminEmails();

  if (!recipients.length) {
    console.warn("[adminNotification] No admin recipients found; skipping supplier response email.");
    return;
  }

  const name = companyName || supplierName || "Supplier";
  const title = fileTitle || (fileId ? `Announcement ${fileId}` : "Announcement");

  await sendMail({
    to: recipients,
    subject: `[MSSS] Supplier responded: ${title}`,
    html: `
      <h3>Supplier submitted a response</h3>
      <p><strong>Supplier:</strong> ${name}</p>
      <p><strong>Announcement:</strong> ${title}</p>
      <p>This supplier just submitted a response. Please sign in to review their submission.</p>
    `,
  });

  console.log(`[adminNotification] Supplier response email sent for ${title} (${name}).`);
}

module.exports.sendSupplierResponseEmail = sendSupplierResponseEmail;
