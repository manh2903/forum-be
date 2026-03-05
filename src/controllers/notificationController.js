const { Notification } = require("../models");

// GET /api/notifications
const getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unread } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { recipientId: req.user.id };
    if (unread === "true") where.isRead = false;

    const { User } = require("../models");
    const { count, rows } = await Notification.findAndCountAll({
      where,
      include: [{ model: User, as: "sender", attributes: ["id", "username", "avatar"] }],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset,
    });

    const unreadCount = await Notification.count({ where: { recipientId: req.user.id, isRead: false } });

    res.json({ notifications: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)), unreadCount });
  } catch (err) {
    next(err);
  }
};

// PUT /api/notifications/read-all
const markAllRead = async (req, res, next) => {
  try {
    await Notification.update({ isRead: true }, { where: { recipientId: req.user.id, isRead: false } });
    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
};

// PUT /api/notifications/:id/read
const markRead = async (req, res, next) => {
  try {
    const notif = await Notification.findOne({ where: { id: req.params.id, recipientId: req.user.id } });
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    await notif.update({ isRead: true });
    res.json({ notification: notif });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/notifications/:id
const deleteNotification = async (req, res, next) => {
  try {
    await Notification.destroy({ where: { id: req.params.id, recipientId: req.user.id } });
    res.json({ message: "Notification deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotifications, markAllRead, markRead, deleteNotification };
