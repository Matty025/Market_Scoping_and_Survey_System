const pool = require("../db");

function buildFingerprint({ userId, type, title, metadata }) {
  // Prefer stable identifiers to avoid duplicates; fall back to title when missing
  const source = metadata?.sourceId || metadata?.fileId || metadata?.uploadId || metadata?.announcementId || metadata?.id || '';
  const status = metadata?.status || '';
  return `${userId || ''}:${type || ''}:${source}:${status || ''}:${title || ''}`;
}

async function createNotification({ userId, type, title, body = null, metadata = null, fingerprint = null }) {
  if (!userId || !type || !title) {
    throw new Error("userId, type, and title are required to create a notification");
  }

  const fp = fingerprint || buildFingerprint({ userId, type, title, metadata });

  const query = `
    INSERT INTO "Notifications" ("UserID", "Type", "Title", "Body", "Metadata", "Fingerprint")
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT ("Fingerprint") DO NOTHING
    RETURNING "NotificationID" AS id,
              "UserID" AS "userId",
              "Type" AS type,
              "Title" AS title,
              "Body" AS body,
              "Metadata" AS metadata,
              "IsRead" AS "isRead",
              "CreatedAt" AS "createdAt",
              "Fingerprint" AS "fingerprint"
  `;
  const values = [userId, type, title, body, metadata, fp];
  const { rows } = await pool.query(query, values);
  return rows[0] || null; // null when conflict (duplicate)
}

async function listNotifications(userId, { limit = 20, offset = 0, unreadOnly = false } = {}) {
  if (!userId) throw new Error("userId is required");
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const where = ["\"UserID\" = $1"];
  const params = [userId];
  if (unreadOnly) {
    where.push("\"IsRead\" = false");
  }

  const query = `
    SELECT "NotificationID" AS id,
           "UserID" AS "userId",
           "Type" AS type,
           "Title" AS title,
           "Body" AS body,
           "Metadata" AS metadata,
           "IsRead" AS "isRead",
           "CreatedAt" AS "createdAt"
    FROM "Notifications"
    WHERE ${where.join(" AND ")}
    ORDER BY "CreatedAt" DESC
    LIMIT ${safeLimit}
    OFFSET ${safeOffset}
  `;

  const { rows } = await pool.query(query, params);

  const countQuery = `SELECT COUNT(*) FROM "Notifications" WHERE ${where.join(" AND ")}`;
  const { rows: countRows } = await pool.query(countQuery, params);
  return { items: rows, total: Number(countRows[0].count || 0) };
}

async function markRead(userId, notificationId) {
  const query = `
    UPDATE "Notifications"
    SET "IsRead" = true, "UpdatedAt" = NOW()
    WHERE "NotificationID" = $1 AND "UserID" = $2
    RETURNING "NotificationID" AS id
  `;
  const { rowCount } = await pool.query(query, [notificationId, userId]);
  return rowCount > 0;
}

async function markAllRead(userId) {
  const query = `
    UPDATE "Notifications"
    SET "IsRead" = true, "UpdatedAt" = NOW()
    WHERE "UserID" = $1 AND "IsRead" = false
  `;
  const { rowCount } = await pool.query(query, [userId]);
  return rowCount;
}

async function countUnread(userId) {
  const query = `SELECT COUNT(*) FROM "Notifications" WHERE "UserID" = $1 AND "IsRead" = false`;
  const { rows } = await pool.query(query, [userId]);
  return Number(rows[0]?.count || 0);
}

module.exports = {
  createNotification,
  listNotifications,
  markRead,
  markAllRead,
  countUnread,
  buildFingerprint,
};
