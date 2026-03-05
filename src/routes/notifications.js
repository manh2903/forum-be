const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth");
const { getNotifications, markAllRead, markRead, deleteNotification } = require("../controllers/notificationController");

router.get("/", authenticate, getNotifications);
router.put("/read-all", authenticate, markAllRead);
router.put("/:id/read", authenticate, markRead);
router.delete("/:id", authenticate, deleteNotification);

module.exports = router;
