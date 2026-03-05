const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Category = sequelize.define("Category", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
  icon: { type: DataTypes.STRING(255) },
  color: { type: DataTypes.STRING(50), defaultValue: "#2563EB" },
  order: { type: DataTypes.INTEGER, defaultValue: 0 },
});

const Topic = sequelize.define("Topic", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  categoryId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
  icon: { type: DataTypes.STRING(255) },
  postCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  followerCount: { type: DataTypes.INTEGER, defaultValue: 0 },
});

const Tag = sequelize.define("Tag", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  slug: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT },
  postCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  color: { type: DataTypes.STRING(50), defaultValue: "#64748B" },
});

const TopicFollow = sequelize.define(
  "TopicFollow",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    topicId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    indexes: [{ unique: true, fields: ["userId", "topicId"] }],
  },
);

module.exports = { Category, Topic, Tag, TopicFollow };
