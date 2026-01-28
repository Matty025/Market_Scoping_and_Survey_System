const express = require("express");
const router = express.Router();
const { protect } = require("./authMiddleware");
const notificationService = require("../services/notificationService");

router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user?.userID || req.user?.UserID || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });

    const { limit = 20, offset = 0, unreadOnly } = req.query || {};
    const { items, total } = await notificationService.listNotifications(userId, {
      limit,
      offset,
      unreadOnly: String(unreadOnly).toLowerCase() === "true",
    });
    res.json({ items, total });
  } catch (err) {
    console.error("[notificationRoutes] list error:", err && err.message ? err.message : err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/unread-count", protect, async (req, res) => {
  try {
    const userId = req.user?.userID || req.user?.UserID || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });
    const count = await notificationService.countUnread(userId);
    res.json({ count });
  } catch (err) {
    console.error("[notificationRoutes] unread-count error:", err && err.message ? err.message : err);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:id/read", protect, async (req, res) => {
  try {
    const userId = req.user?.userID || req.user?.UserID || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });
    const id = Number(req.params.id);
    const ok = await notificationService.markRead(userId, id);
    if (!ok) return res.status(404).json({ message: "Notification not found" });
    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("[notificationRoutes] mark read error:", err && err.message ? err.message : err);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/read-all", protect, async (req, res) => {
  try {
    const userId = req.user?.userID || req.user?.UserID || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authorized" });
    const updated = await notificationService.markAllRead(userId);
    res.json({ message: "Notifications marked as read", updated });
  } catch (err) {
    console.error("[notificationRoutes] mark all read error:", err && err.message ? err.message : err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
