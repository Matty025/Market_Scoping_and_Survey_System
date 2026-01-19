const db = require("../db");
const nodemailer = require("nodemailer");
const mailer = require("../utils/mailer");

const STATUS_LABELS = {
  PENDING: "Pending Review",
  REVIEWED: "Reviewed",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};

const formatStatusLabel = (status) => {
  if (!status) return "Pending Review";
  const key = status.toString().toUpperCase();
  return STATUS_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

// Resolve sendMail from shared mailer with fallbacks
let sendMail =
  (mailer && typeof mailer.sendMail === "function" && mailer.sendMail)
  || (mailer && typeof mailer === "function" && mailer)
  || (mailer && typeof mailer.default === "function" && mailer.default)
  || (mailer && mailer.transporter && typeof mailer.transporter.sendMail === "function" && ((opts) => mailer.transporter.sendMail(opts)))
  || null;

if (!sendMail) {
  try {
    const user = process.env.SYSTEM_EMAIL;
    const pass = process.env.SYSTEM_EMAIL_APP_PASSWORD;
    if (user && pass) {
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
      console.log("[prNotification] Using fallback transporter.");
    } else {
      console.warn("[prNotification] Missing SYSTEM_EMAIL or SYSTEM_EMAIL_APP_PASSWORD; mailer unavailable.");
    }
  } catch (err) {
    console.warn("[prNotification] Failed to init fallback transporter:", err && err.message ? err.message : err);
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

async function getBuyerForUpload(uploadId) {
  const { rows } = await db.query(
    `SELECT bu."UploadID" as id,
            bu."Title" as title,
            bu."Description" as description,
            bu."Status" as status,
            bu."AdminFeedback" as feedback,
            u."Email" as email,
            u."FullName" as fullName
       FROM "BuyerUploads" bu
       JOIN "Users" u ON u."UserID" = bu."UserID"
      WHERE bu."UploadID" = $1
      LIMIT 1`,
    [uploadId]
  );
  return rows[0] || null;
}

async function notifyAdminNewPurchaseRequest(uploadId) {
  if (!sendMail) return;
  const info = await getBuyerForUpload(uploadId);
  if (!info) return;

  const recipients = await getAdminEmails();
  if (!recipients.length) return;

  const subject = `[MSSS] New Purchase Request Submitted`;
  await sendMail({
    to: recipients,
    subject,
    html: `
      <h3>New purchase request submitted</h3>
      <p><strong>Title:</strong> ${info.title || "(no title)"}</p>
      <p><strong>Buyer:</strong> ${info.fullName || "(unknown)"}</p>
      <p>Please review and update the status in the admin console.</p>
    `,
  });

  console.log(`[prNotification] Admin new PR email sent for upload ${uploadId} to ${recipients.join(", ")}`);
}

async function notifyBuyerPurchaseStatus(uploadId, status, feedback) {
  if (!sendMail) return;
  const info = await getBuyerForUpload(uploadId);
  if (!info || !info.email) return;

  const statusLabel = formatStatusLabel(status || info.status || "");
  const note = (feedback && feedback.toString().trim())
    || (info.feedback && info.feedback.toString().trim())
    || "No additional notes were provided.";

  await sendMail({
    to: info.email,
    subject: `[MSSS] Purchase Request ${statusLabel}`,
    html: `
      <h3>Hello ${info.fullName || "Buyer"},</h3>
      <p>Your purchase request <strong>${info.title || "(untitled)"}</strong> is now <strong>${statusLabel}</strong>.</p>
      <p><strong>Notes:</strong></p>
      <p>${note.replace(/\n/g, "<br/>")}</p>
      <p>If you have questions, please reply to this email.</p>
    `,
  });

  console.log(`[prNotification] Buyer status email sent to ${info.email} for upload ${uploadId} status ${statusLabel}`);
}

module.exports = {
  notifyAdminNewPurchaseRequest,
  notifyBuyerPurchaseStatus,
};
