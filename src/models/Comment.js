const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Comment = sequelize.define(
  "Comment",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    postId: { type: DataTypes.INTEGER, allowNull: false },
    authorId: { type: DataTypes.INTEGER, allowNull: false },
    parentId: { type: DataTypes.INTEGER, defaultValue: null },
    depth: { type: DataTypes.INTEGER, defaultValue: 0 },
    content: { type: DataTypes.TEXT("long"), allowNull: false },
    likeCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    indexes: [{ fields: ["postId"] }, { fields: ["authorId"] }, { fields: ["parentId"] }],
  },
);

const CommentLike = sequelize.define(
  "CommentLike",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    commentId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    indexes: [{ unique: true, fields: ["userId", "commentId"] }],
  },
);

module.exports = { Comment, CommentLike };
