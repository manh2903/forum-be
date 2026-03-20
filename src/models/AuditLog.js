const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(100), allowNull: false }, // e.g., 'POST', 'DELETE', or custom 'ban_user'
    method: { type: DataTypes.STRING(10) },
    endpoint: { type: DataTypes.STRING(255) },
    requestBody: { type: DataTypes.TEXT },
    status: { type: DataTypes.INTEGER },
    duration: { type: DataTypes.INTEGER },
    ipAddress: { type: DataTypes.STRING(50) },
    userAgent: { type: DataTypes.TEXT },
    error: { type: DataTypes.TEXT },
    targetType: { type: DataTypes.STRING(50) },
    details: { type: DataTypes.JSON },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    indexes: [{ fields: ["userId"] }, { fields: ["createdAt"] }, { fields: ["endpoint"] }, { fields: ["status"] }],
    defaultScope: { where: { isDeleted: false } },
  },
);

const SearchHistory = sequelize.define(
  "SearchHistory",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    query: { type: DataTypes.STRING(255), allowNull: false },
    resultCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    indexes: [{ fields: ["userId", "createdAt"] }],
    defaultScope: { where: { isDeleted: false } },
  },
);

module.exports = { AuditLog, SearchHistory };
