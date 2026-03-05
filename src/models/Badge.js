const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Badge = sequelize.define("Badge", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
  icon: { type: DataTypes.STRING(255) },
  color: { type: DataTypes.STRING(50), defaultValue: "#FFD700" },
  criteria: { type: DataTypes.JSON },
});

const UserBadge = sequelize.define("UserBadge", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  badgeId: { type: DataTypes.INTEGER, allowNull: false },
  awardedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
});

module.exports = { Badge, UserBadge };
