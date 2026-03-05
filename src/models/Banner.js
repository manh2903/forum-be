const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Banner = sequelize.define(
  "Banner",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING },
    imageUrl: { type: DataTypes.STRING(500), allowNull: false },
    link: { type: DataTypes.STRING(500) },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    position: { type: DataTypes.STRING, defaultValue: "home_top" }, // position can be used for different banner locations
  },
  {
    timestamps: true,
  },
);

module.exports = Banner;
