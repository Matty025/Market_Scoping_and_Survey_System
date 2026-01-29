const nodemailer = require("nodemailer");
const mailer = require("../utils/mailer");
// For admin-facing notifications about announcement lifecycle changes
const db = require("../db");
const notificationService = require("./notificationService");

const formatStatusLabel = (status) => {
  if (!status) return "Unknown";
  return String(status)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
};

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

async function notifySuppliersPosted({ fileId, title, supplierIds, status = "POSTED" }) {
  const statusLabel = String(status || "POSTED").toUpperCase();
  const isRepost = statusLabel === "REPOSTED";
  if (sendMail) {
    const recipients = await getSupplierEmailsByIds(supplierIds);
    if (!recipients.length) {
      console.warn("[announcementNotification] No supplier recipients for posted announcement", { fileId });
    } else {
      const subject = isRepost
        ? `[MSSS] Announcement Updated: ${title || fileId}`
        : `[MSSS] New Announcement: ${title || fileId}`;
      const html = `
        <h3>${isRepost ? "Announcement updated/reposted" : "New procurement announcement posted"}</h3>
        <p><strong>Title:</strong> ${title || '(Untitled announcement)'}</p>
        <p>You have been invited to participate. Sign in to view the details and respond.</p>
      `;
      await sendMail({
        to: recipients.map((r) => r.email),
        subject,
        html,
      });
      console.log(`[announcementNotification] ${isRepost ? 'Repost' : 'Post'} email sent for file ${fileId} to ${recipients.length} suppliers.`);
    }
  }

  // In-app notifications (best-effort, deduped by fingerprint)
  await createSupplierNotifications({
    supplierIds,
    type: "announcement_posted",
    title: title || `Announcement ${fileId}`,
    body: isRepost
      ? "An announcement you follow has been updated/reposted."
      : "A new announcement has been posted to your categories.",
    metadata: { sourceId: fileId, status: statusLabel },
  });
}

async function notifySuppliersStatusChange({ fileId, title, status, previousStatus, notes, supplierIds }) {
  let statusLabel = formatStatusLabel(status);
  const previousStatusLabel = previousStatus ? formatStatusLabel(previousStatus) : null;

  if (sendMail) {
    const recipients = await getSupplierEmailsByIds(supplierIds);
    if (!recipients.length) {
      console.warn('[announcementNotification] No supplier recipients for status change', { fileId });
    } else {
      const subject = `[MSSS] Announcement Update: ${title || fileId} → ${statusLabel}`;
      const lines = [
        `<strong>Announcement:</strong> ${title || `(ID ${fileId})`} `,
        `<strong>New Status:</strong> ${statusLabel}`,
      ];

      if (previousStatusLabel) lines.push(`<strong>Previous Status:</strong> ${previousStatusLabel}`);
      if (notes) {
        lines.push(`<strong>Notes:</strong> ${notes.toString().replace(/\n/g, '<br/>')}`);
      }

      const html = `
        <h3>Announcement status updated</h3>
        <p>${lines.join('<br/>')}</p>
      `;

      await sendMail({ to: recipients.map((r) => r.email), subject, html });
      console.log(`[announcementNotification] Supplier status email sent for file ${fileId} -> ${status} (${recipients.length} recipients)`);
    }
  }

  // In-app notifications (best-effort, deduped by fingerprint)
  await createSupplierNotifications({
    supplierIds,
    type: "announcement_status",
    title: `${title || `Announcement ${fileId}`} update`,
    body: `Status changed to ${statusLabel}.`,
    metadata: { sourceId: fileId, status: status || null, previousStatus: previousStatus || null, notes: notes || null },
  });
}

async function createSupplierNotifications({ supplierIds = [], type, title, body, metadata = {} }) {
  if (!Array.isArray(supplierIds) || supplierIds.length === 0) return;
  const supplierIdsInt = supplierIds.map((id) => Number(id)).filter((n) => Number.isInteger(n));
  if (supplierIdsInt.length === 0) return;

  // Fetch user IDs for suppliers
  const { rows } = await db.query(
    `SELECT DISTINCT u."UserID" AS "userId"
       FROM "Users" u
      WHERE u."SupplierID" = ANY($1::int[]) AND u."UserID" IS NOT NULL`,
    [supplierIdsInt]
  );

  const userIds = rows.map((r) => Number(r.userId)).filter((n) => Number.isInteger(n));
  if (userIds.length === 0) return;

  const tasks = userIds.map((userId) =>
    notificationService.createNotification({
      userId,
      type,
      title,
      body,
      metadata,
    }).catch((err) => {
      console.warn('[announcementNotification] Failed to create supplier notification:', err && err.message ? err.message : err);
      return null;
    })
  );
  await Promise.all(tasks);
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

async function notifyAdminsStatusChange({ fileId, title, status, previousStatus, notes }) {
  const statusLabel = formatStatusLabel(status);
  const previousStatusLabel = previousStatus ? formatStatusLabel(previousStatus) : null;

  if (sendMail) {
    const recipients = await getAdminEmails();
    if (!recipients.length) {
      console.warn('[announcementNotification] No admin recipients for status change email');
    } else {
      const subject = `[MSSS] Announcement Status: ${title || fileId} → ${statusLabel}`;
      const lines = [
        `<strong>Announcement:</strong> ${title || `(ID ${fileId})`}`,
        `<strong>New Status:</strong> ${statusLabel}`,
      ];

      if (previousStatusLabel) lines.push(`<strong>Previous Status:</strong> ${previousStatusLabel}`);
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
  }

  // In-app notification for all admins
  await notificationService.notifyAdmins({
    type: 'announcement_status_admin',
    title: `Announcement status: ${title || fileId}`,
    body: previousStatusLabel
      ? `Changed from ${previousStatusLabel} to ${statusLabel}.`
      : `Changed to ${statusLabel}.`,
    metadata: { sourceId: fileId, status, previousStatus: previousStatus || null, notes: notes || null },
  }).catch((err) => {
    console.warn('[announcementNotification] Failed to create admin in-app notification:', err && err.message ? err.message : err);
  });
}

module.exports = {
  notifySuppliersPosted,
  notifyAdminsStatusChange,
  notifySuppliersStatusChange,
  createSupplierNotifications,
};
