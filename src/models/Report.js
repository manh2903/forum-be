const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Report = sequelize.define(
  "Report",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    reporterId: { type: DataTypes.INTEGER, allowNull: false },
    targetType: { type: DataTypes.ENUM("post", "comment", "user"), allowNull: false },
    targetId: { type: DataTypes.INTEGER, allowNull: false },
    targetOwnerId: { type: DataTypes.INTEGER, allowNull: true },
    reason: {
      type: DataTypes.ENUM("spam", "harassment", "misinformation", "inappropriate", "copyright", "other"),
      allowNull: false,
    },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM("pending", "reviewing", "resolved", "dismissed"), defaultValue: "pending" },
    resolvedById: { type: DataTypes.INTEGER, defaultValue: null },
    resolvedAt: { type: DataTypes.DATE, defaultValue: null },
    resolution: { type: DataTypes.TEXT, defaultValue: null },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    indexes: [{ unique: true, fields: ["reporterId", "targetType", "targetId"] }, { fields: ["status"] }],
    defaultScope: { where: { isDeleted: false } },
  },
);

module.exports = Report;
