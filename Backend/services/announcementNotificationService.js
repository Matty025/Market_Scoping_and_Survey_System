const nodemailer = require("nodemailer");
const mailer = require("../utils/mailer");
// For admin-facing notifications about announcement lifecycle changes
const db = require("../db");

// Resolve sendMail similar to other services
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
      console.log("[announcementNotification] Using fallback transporter.");
    } else {
      console.warn("[announcementNotification] Missing SYSTEM_EMAIL or SYSTEM_EMAIL_APP_PASSWORD; mailer unavailable.");
    }
  } catch (err) {
    console.warn("[announcementNotification] Failed to init fallback transporter:", err && err.message ? err.message : err);
  }
}

async function getSupplierEmailsByIds(supplierIds = []) {
  if (!Array.isArray(supplierIds) || supplierIds.length === 0) return [];
  const ids = supplierIds.filter((v) => Number.isInteger(Number(v))).map((v) => Number(v));
  if (ids.length === 0) return [];
  const { rows } = await db.query(
    `SELECT s."SupplierID" as "supplierId",
            COALESCE(NULLIF(TRIM(s."CompanyName"), ''), 'Supplier ' || s."SupplierID") AS "name",
            u."Email" as "email",
            u."FullName" as "contactName"
       FROM "Suppliers" s
       LEFT JOIN "Users" u ON u."SupplierID" = s."SupplierID"
      WHERE s."SupplierID" = ANY($1::int[]) AND u."Email" IS NOT NULL`,
    [ids]
  );
  // De-dupe by supplierId then by email
  const seen = new Set();
  const emails = new Set();
  const result = [];
  for (const r of rows) {
    const sid = r.supplierId;
    if (seen.has(sid)) continue;
    if (!r.email) continue;
    if (emails.has(r.email)) continue;
    seen.add(sid);
    emails.add(r.email);
    result.push({ supplierId: sid, email: r.email, name: r.name, contactName: r.contactName });
  }
  return result;
}

async function notifySuppliersPosted({ fileId, title, supplierIds }) {
  if (!sendMail) return;
  const recipients = await getSupplierEmailsByIds(supplierIds);
  if (!recipients.length) {
    console.warn("[announcementNotification] No supplier recipients for posted announcement", { fileId });
    return;
  }
  const subject = `[MSSS] New Announcement: ${title || fileId}`;
  const html = `
    <h3>New procurement announcement posted</h3>
    <p><strong>Title:</strong> ${title || '(untitled announcement)'}</p>
    <p>Please sign in to view details and respond.</p>
  `;
  await sendMail({
    to: recipients.map((r) => r.email),
    subject,
    html,
  });
  console.log(`[announcementNotification] Posted email sent for file ${fileId} to ${recipients.length} suppliers.`);
}

async function notifyWinner({ fileId, title, winnerSupplierId }) {
  if (!sendMail || !winnerSupplierId) return;
  const recipients = await getSupplierEmailsByIds([winnerSupplierId]);
  if (!recipients.length) return;
  const r = recipients[0];
  const subject = `[MSSS] Awarded: ${title || fileId}`;
  const html = `
    <h3>Congratulations!</h3>
    <p>You have been awarded for the announcement <strong>${title || '(untitled announcement)'}</strong>.</p>
    <p>Please sign in to review next steps.</p>
  `;
  await sendMail({ to: r.email, subject, html });
  console.log(`[announcementNotification] Winner email sent to supplier ${winnerSupplierId} for file ${fileId}`);
}

async function notifyLosers({ fileId, title, winnerName, loserSupplierIds }) {
  if (!sendMail) return;
  const recipients = await getSupplierEmailsByIds(loserSupplierIds);
  if (!recipients.length) return;
  const subject = `[MSSS] Update: ${title || fileId}`;
  const html = `
    <h3>Thank you for participating</h3>
    <p>The announcement <strong>${title || '(untitled announcement)'}</strong> has been awarded to <strong>${winnerName || 'another supplier'}</strong>.</p>
    <p>We appreciate your participation and encourage you to join future opportunities.</p>
  `;
  await sendMail({
    to: recipients.map((r) => r.email),
    subject,
    html,
  });
  console.log(`[announcementNotification] Loser emails sent for file ${fileId} to ${recipients.length} suppliers.`);
}

async function getAdminEmails() {
  const { rows } = await db.query(
    `SELECT u."Email"
       FROM "Users" u
       JOIN "Roles" r ON r."RoleID" = u."RoleID"
      WHERE LOWER(r."RoleName") = 'admin'
        AND u."Email" IS NOT NULL`
  );
  return rows.map((r) => r.Email).filter(Boolean);
}

async function notifyAdminsStatusChange({ fileId, title, status, previousStatus, notes, awardedSupplierId, awardedSupplierName, losingSupplierIds }) {
  if (!sendMail) return;
  const recipients = await getAdminEmails();
  if (!recipients.length) {
    console.warn('[announcementNotification] No admin recipients for status change email');
    return;
  }

  const subject = `[MSSS] Announcement status: ${title || fileId} -> ${status}`;
  const lines = [
    `<strong>Announcement:</strong> ${title || `(ID ${fileId})`}`,
    `<strong>New Status:</strong> ${status || 'N/A'}`,
  ];

  if (previousStatus) lines.push(`<strong>Previous Status:</strong> ${previousStatus}`);
  if (awardedSupplierId) {
    lines.push(`<strong>Awarded Supplier:</strong> ${awardedSupplierName || `Supplier ${awardedSupplierId}`} (ID ${awardedSupplierId})`);
  }
  if (Array.isArray(losingSupplierIds) && losingSupplierIds.length > 0) {
    lines.push(`<strong>Non-awarded suppliers:</strong> ${losingSupplierIds.join(', ')}`);
  }
  if (notes) {
    lines.push(`<strong>Notes:</strong> ${notes.toString().replace(/\n/g, '<br/>')}`);
  }

  const html = `
    <h3>Announcement status changed</h3>
    <p>${lines.join('<br/>')}</p>
  `;

  await sendMail({ to: recipients, subject, html });
  console.log(`[announcementNotification] Admin status email sent for file ${fileId} -> ${status}`);
}

module.exports = {
  notifySuppliersPosted,
  notifyWinner,
  notifyLosers,
  notifyAdminsStatusChange,
};
