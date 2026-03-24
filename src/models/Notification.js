const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Notification = sequelize.define(
  "Notification",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    recipientId: { type: DataTypes.INTEGER, allowNull: false },
    senderId: { type: DataTypes.INTEGER, allowNull: true },
    type: {
      type: DataTypes.ENUM(
        "like_post",
        "like_comment",
        "comment",
        "reply",
        "follow",
        "mention",
        "post_featured",
        "badge_earned",
        "report_resolved",
        "pending_post",
        "new_report",
        "system",
      ),
      allowNull: false,
    },
    entityType: { type: DataTypes.ENUM("post", "comment", "user", "badge", "report") },
    entityId: { type: DataTypes.INTEGER },
    content: { type: DataTypes.TEXT },
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    isEmailSent: { type: DataTypes.BOOLEAN, defaultValue: false },
    link: { type: DataTypes.STRING(500) },
    slug: { type: DataTypes.STRING(255) },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    indexes: [{ fields: ["recipientId", "isRead"] }, { fields: ["createdAt"] }],
    defaultScope: { where: { isDeleted: false } },
  },
);

module.exports = Notification;
