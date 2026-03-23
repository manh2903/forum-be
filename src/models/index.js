const User = require("./User");
const Follow = require("./Follow");
const { Badge, UserBadge } = require("./Badge");
const { Category, Topic, Tag, TopicFollow } = require("./Topic");
const { Post, PostLike, Bookmark, PostTag } = require("./Post");
const { Comment, CommentLike } = require("./Comment");
const Notification = require("./Notification");
const Report = require("./Report");
const { AuditLog, SearchHistory } = require("./AuditLog");
const Banner = require("./Banner");
const Setting = require("./Setting");

// =====================
// User Associations
// =====================
User.hasMany(Post, { foreignKey: "authorId", as: "posts" });
Post.belongsTo(User, { foreignKey: "authorId", as: "author" });

User.hasMany(Comment, { foreignKey: "authorId", as: "comments" });
Comment.belongsTo(User, { foreignKey: "authorId", as: "author" });

// Follow
User.belongsToMany(User, { through: Follow, as: "followers", foreignKey: "followingId", otherKey: "followerId" });
User.belongsToMany(User, { through: Follow, as: "following", foreignKey: "followerId", otherKey: "followingId" });
Follow.belongsTo(User, { as: "follower", foreignKey: "followerId" });
Follow.belongsTo(User, { as: "following", foreignKey: "followingId" });

// Badges
User.belongsToMany(Badge, { through: UserBadge, as: "badges", foreignKey: "userId" });
Badge.belongsToMany(User, { through: UserBadge, as: "users", foreignKey: "badgeId" });

// =====================
// Post Associations
// =====================
Post.belongsTo(Topic, { foreignKey: "topicId", as: "topic" });
Topic.hasMany(Post, { foreignKey: "topicId", as: "posts" });

// Tags
Post.belongsToMany(Tag, { through: PostTag, as: "tags", foreignKey: "postId" });
Tag.belongsToMany(Post, { through: PostTag, as: "posts", foreignKey: "tagId" });

// Likes
User.belongsToMany(Post, { through: PostLike, as: "likedPosts", foreignKey: "userId" });
Post.belongsToMany(User, { through: PostLike, as: "likedBy", foreignKey: "postId" });

// Bookmarks
User.belongsToMany(Post, { through: Bookmark, as: "bookmarkedPosts", foreignKey: "userId" });
Post.belongsToMany(User, { through: Bookmark, as: "bookmarkedBy", foreignKey: "postId" });
User.hasMany(Bookmark, { foreignKey: "userId", as: "bookmarks" });
Post.hasMany(Bookmark, { foreignKey: "postId", as: "bookmarks" });
Bookmark.belongsTo(User, { foreignKey: "userId" });
Bookmark.belongsTo(Post, { foreignKey: "postId" });

// Comments
Post.hasMany(Comment, { foreignKey: "postId", as: "comments" });
Comment.belongsTo(Post, { foreignKey: "postId", as: "post" });
Comment.hasMany(Comment, { foreignKey: "parentId", as: "replies" });
Comment.belongsTo(Comment, { foreignKey: "parentId", as: "parent" });

// Comment likes
User.belongsToMany(Comment, { through: CommentLike, as: "likedComments", foreignKey: "userId" });
Comment.belongsToMany(User, { through: CommentLike, as: "likedBy", foreignKey: "commentId" });

// =====================
// Topic Associations
// =====================
Category.hasMany(Topic, { foreignKey: "categoryId", as: "topics" });
Topic.belongsTo(Category, { foreignKey: "categoryId", as: "category" });

User.belongsToMany(Topic, { through: TopicFollow, as: "followedTopics", foreignKey: "userId" });
Topic.belongsToMany(User, { through: TopicFollow, as: "followers", foreignKey: "topicId" });

// =====================
// Notification Associations
// =====================
Notification.belongsTo(User, { foreignKey: "recipientId", as: "recipient" });
Notification.belongsTo(User, { foreignKey: "senderId", as: "sender" });
User.hasMany(Notification, { foreignKey: "recipientId", as: "notifications" });

// =====================
// Report Associations
// =====================
Report.belongsTo(User, { foreignKey: "reporterId", as: "reporter" });
Report.belongsTo(User, { foreignKey: "resolvedById", as: "resolver" });
Report.belongsTo(User, { foreignKey: "targetOwnerId", as: "targetOwner" });

// AuditLog Associations
// =====================
AuditLog.belongsTo(User, { foreignKey: "userId", as: "user" });
SearchHistory.belongsTo(User, { foreignKey: "userId", as: "user" });

module.exports = {
  User,
  Follow,
  Badge,
  UserBadge,
  Category,
  Topic,
  Tag,
  TopicFollow,
  Post,
  PostLike,
  Bookmark,
  PostTag,
  Comment,
  CommentLike,
  Notification,
  Report,
  AuditLog,
  SearchHistory,
  Banner,
  Setting,
};
