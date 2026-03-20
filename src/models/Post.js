const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Post = sequelize.define(
  "Post",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    authorId: { type: DataTypes.INTEGER, allowNull: false },
    topicId: { type: DataTypes.INTEGER, allowNull: true },
    title: { type: DataTypes.STRING(500), allowNull: false },
    slug: { type: DataTypes.STRING(550), allowNull: false, unique: true },
    content: { type: DataTypes.TEXT("long"), allowNull: false },
    excerpt: { type: DataTypes.TEXT },
    coverImage: { type: DataTypes.STRING(500) },
    status: { type: DataTypes.ENUM("draft", "published", "archived"), defaultValue: "draft" },
    isPinned: { type: DataTypes.BOOLEAN, defaultValue: false },
    isFeatured: { type: DataTypes.BOOLEAN, defaultValue: false },
    likeCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    commentCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    viewCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    bookmarkCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    readTime: { type: DataTypes.INTEGER, defaultValue: 0 },
    publishedAt: { type: DataTypes.DATE },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    indexes: [
      { fields: ["authorId"] },
      { fields: ["topicId"] },
      { fields: ["status"] },
      { fields: ["createdAt"] },
      { type: "FULLTEXT", fields: ["title", "content", "excerpt"] },
    ],
    defaultScope: {
      where: { isDeleted: false },
    },
  },
);

const PostLike = sequelize.define(
  "PostLike",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    postId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    indexes: [{ unique: true, fields: ["userId", "postId"] }],
  },
);

const Bookmark = sequelize.define(
  "Bookmark",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    postId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    indexes: [{ unique: true, fields: ["userId", "postId"] }],
  },
);

const PostTag = sequelize.define(
  "PostTag",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    postId: { type: DataTypes.INTEGER, allowNull: false },
    tagId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    indexes: [{ unique: true, fields: ["postId", "tagId"] }],
  },
);

module.exports = { Post, PostLike, Bookmark, PostTag };
