const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    adminId: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING(100), allowNull: false },
    targetType: { type: DataTypes.STRING(50) },
    targetId: { type: DataTypes.INTEGER },
    details: { type: DataTypes.JSON },
    ipAddress: { type: DataTypes.STRING(50) },
  },
  {
    indexes: [{ fields: ["adminId", "createdAt"] }],
  },
);

const SearchHistory = sequelize.define(
  "SearchHistory",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    query: { type: DataTypes.STRING(255), allowNull: false },
    resultCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    indexes: [{ fields: ["userId", "createdAt"] }],
  },
);

module.exports = { AuditLog, SearchHistory };
