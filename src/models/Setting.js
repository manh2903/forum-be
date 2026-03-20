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
  },
  {
    timestamps: true,
  }
);

module.exports = Setting;
