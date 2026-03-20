const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Setting = sequelize.define(
  "Setting",
  {
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.TEXT("long"), // Support HTML content
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    timestamps: true,
    defaultScope: { where: { isDeleted: false } }
  }
);

module.exports = Setting;
