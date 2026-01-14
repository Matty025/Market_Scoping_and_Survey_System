const crypto = require("crypto");

// In-memory pre-registration verification store.
// For production, move to a shared store (e.g., Redis/DB).
const store = new Map(); // token -> { email, expiresAt, verified }

const PREVERIFY_EXP_MS = 24 * 60 * 60 * 1000; // 24h

function createEntry(email) {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + PREVERIFY_EXP_MS;
  store.set(token, { email, expiresAt, verified: false });
  return { token, expiresAt };
}

function markVerified(token) {
  const entry = store.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(token);
    return null;
  }
  entry.verified = true;
  store.set(token, entry);
  return entry;
}

function getStatus(token) {
  const entry = store.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(token);
    return null;
  }
  return entry;
}

function requireVerified(email, token) {
  const entry = getStatus(token);
  if (!entry) return { ok: false, reason: "invalid" };
  if (entry.email.toLowerCase() !== email.toLowerCase()) return { ok: false, reason: "mismatch" };
  if (!entry.verified) return { ok: false, reason: "unverified" };
  return { ok: true };
}

module.exports = {
  createEntry,
  markVerified,
  getStatus,
  requireVerified,
};
