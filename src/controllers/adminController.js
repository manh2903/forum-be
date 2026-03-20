const { fn, col, literal, Op } = require("sequelize");
const { User, Post, Comment, Report, AuditLog, Tag } = require("../models");
const { updateFeaturedPosts } = require("../utils/featuredJob");

// GET /api/admin/users
const getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (search) where[Op.or] = [{ username: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } }];
    if (role) where.role = role;
    if (status === "banned") where.isBanned = true;
    if (status === "active") where.isBanned = false;

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ["password", "resetPasswordToken", "resetPasswordExpires", "googleId", "githubId"] },
      limit: parseInt(limit),
      offset,
      order: [["createdAt", "DESC"]],
    });
    res.json({ users: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/users/:id/ban
const banUser = async (req, res, next) => {
  try {
    const { banReason } = req.body;
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") return res.status(403).json({ message: "Cannot ban admin" });

    await user.update({ isBanned: true, banReason });
    await AuditLog.create({
      userId: req.user.id,
      action: "ban_user",
      targetType: "user",
      targetId: user.id,
      details: { banReason },
      ipAddress: req.ip,
    });
    res.json({ message: "User banned", user });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/users/:id/unban
const unbanUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    await user.update({ isBanned: false, banReason: null });
    await AuditLog.create({ userId: req.user.id, action: "unban_user", targetType: "user", targetId: user.id, ipAddress: req.ip });
    res.json({ message: "User unbanned", user });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/users/:id/role
const changeRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!["user", "moderator", "admin"].includes(role)) return res.status(400).json({ message: "Invalid role" });
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    await user.update({ role });
    await AuditLog.create({
      userId: req.user.id,
      action: "change_role",
      targetType: "user",
      targetId: user.id,
      details: { role },
      ipAddress: req.ip,
    });
    res.json({ message: "Role updated", user });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/posts/:id/pin
const togglePinPost = async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    await post.update({ isPinned: !post.isPinned });
    res.json({ post });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/posts/:id/feature
const toggleFeaturePost = async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    await post.update({ isFeatured: !post.isFeatured });
    res.json({ post });
  } catch (err) {
    next(err);
  }
};
// GET /api/admin/posts
const getPostsAdmin = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, topicId, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (search) where.title = { [Op.like]: `%${search}%` };
    if (topicId) where.topicId = topicId;
    if (status) where.status = status;

    const { count, rows } = await Post.findAndCountAll({
      where,
      distinct: true,
      include: [
        { model: User, as: "author", attributes: ["id", "username", "avatar"] },
        { model: Tag, as: "tags", through: { attributes: [] } },
      ],
      limit: parseInt(limit),
      offset,
      order: [["createdAt", "DESC"]],
    });
    res.json({ posts: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/posts/:id
const updatePostAdmin = async (req, res, next) => {
  try {
    const { title, content, topicId, status, isPinned, isFeatured } = req.body;
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    await post.update({ title, content, topicId, status, isPinned, isFeatured });
    await AuditLog.create({
      userId: req.user.id,
      action: "update_post_admin",
      targetType: "post",
      targetId: post.id,
      details: { updatedFields: req.body },
      ipAddress: req.ip,
    });
    res.json({ message: "Đã cập nhật bài viết", post });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/posts/:id/status
const togglePostStatus = async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const newStatus = post.status === "published" ? "archived" : "published";
    await post.update({ status: newStatus });
    res.json({ message: `Đã ${newStatus === "published" ? "hiện" : "ẩn"} bài viết`, status: newStatus });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/analytics
const getAnalytics = async (req, res, next) => {
  try {
    const { sequelize } = require("../config/database");

    const [userCount, postCount, commentCount, reportCount] = await Promise.all([
      User.count(),
      Post.count({ where: { status: "published" } }),
      Comment.count(),
      Report.count({ where: { status: "pending" } }),
    ]);

    // Top posts
    const topPosts = await Post.findAll({
      where: { status: "published" },
      attributes: ["id", "title", "slug", "likeCount", "viewCount", "commentCount", "createdAt"],
      order: [["viewCount", "DESC"]],
      limit: 5,
    });

    // Top users by reputation
    const topUsers = await User.findAll({
      attributes: ["id", "username", "avatar", "reputation", "role"],
      order: [["reputation", "DESC"]],
      limit: 5,
    });

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [newUsers, newPosts] = await Promise.all([
      User.count({ where: { createdAt: { [Op.gte]: sevenDaysAgo } } }),
      Post.count({ where: { status: "published", createdAt: { [Op.gte]: sevenDaysAgo } } }),
    ]);

    // Growth chart (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [userGrowth, postGrowth] = await Promise.all([
      User.findAll({
        where: { createdAt: { [Op.gte]: thirtyDaysAgo } },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("COUNT", col("id")), "count"],
        ],
        group: [fn("DATE", col("createdAt"))],
        order: [[fn("DATE", col("createdAt")), "ASC"]],
        raw: true,
      }),
      Post.findAll({
        where: { status: "published", createdAt: { [Op.gte]: thirtyDaysAgo } },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("COUNT", col("id")), "count"],
        ],
        group: [fn("DATE", col("createdAt"))],
        order: [[fn("DATE", col("createdAt")), "ASC"]],
        raw: true,
      })
    ]);

    // Top Tags
    const topTags = await Tag.findAll({
      attributes: ["id", "name", [fn("COUNT", col("posts.id")), "postCount"]],
      include: [{ model: Post, as: "posts", attributes: [], through: { attributes: [] } }],
      group: ["Tag.id"],
      order: [[fn("COUNT", col("posts.id")), "DESC"]],
      limit: 10,
      subQuery: false
    });

    // Role Distribution
    const roleDistribution = await User.findAll({
      attributes: ["role", [fn("COUNT", col("id")), "count"]],
      group: ["role"],
      raw: true
    });

    // Report Summary
    const [resolvedReports, totalReports] = await Promise.all([
      Report.count({ where: { status: { [Op.ne]: "pending" } } }),
      Report.count()
    ]);

    // Latest Audit Logs (Last 5)
    const latestAuditLogs = await AuditLog.findAll({
      limit: 5,
      order: [["createdAt", "DESC"]],
      include: [{ model: User, as: "user", attributes: ["username", "avatar"] }]
    });

    res.json({
      overview: { 
        userCount, postCount, commentCount, 
        pendingReports: reportCount, totalReports, resolvedReports,
        newUsersWeek: newUsers, newPostsWeek: newPosts 
      },
      topPosts,
      topUsers,
      topTags,
      roleDistribution,
      latestAuditLogs,
      charts: { userGrowth, postGrowth },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/audit-logs
const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, action } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (action) where.action = action;

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: "user", attributes: ["id", "username", "avatar"] }],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset,
    });
    res.json({ logs: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/audit-analytics
const getAuditAnalytics = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalLogs, errorLogs, activeAdmins, dailyTrend] = await Promise.all([
      AuditLog.count(),
      AuditLog.count({ where: { status: { [Op.gte]: 400 } } }),
      AuditLog.findAll({
        attributes: [
          [col("userId"), "userId"],
          [fn("COUNT", col("id")), "count"],
        ],
        include: [{ model: User, as: "user", attributes: ["username", "avatar"] }],
        group: ["userId", "user.id"],
        order: [[fn("COUNT", col("id")), "DESC"]],
        limit: 5,
      }),
      AuditLog.findAll({
        where: { createdAt: { [Op.gte]: thirtyDaysAgo } },
        attributes: [
          [fn("DATE", col("createdAt")), "date"],
          [fn("COUNT", col("id")), "count"],
          [fn("SUM", literal("CASE WHEN status >= 400 THEN 1 ELSE 0 END")), "errors"]
        ],
        group: [fn("DATE", col("createdAt"))],
        order: [[fn("DATE", col("createdAt")), "ASC"]],
        raw: true
      })
    ]);

    res.json({
      summary: { totalLogs, errorLogs, errorRate: totalLogs ? (errorLogs / totalLogs * 100).toFixed(1) : 0 },
      activeAdmins,
      dailyTrend
    });
  } catch (err) {
    next(err);
  }
};

const updateFeaturedPostsTrigger = async (req, res) => {
  try {
    await updateFeaturedPosts();
    res.json({ message: "Đã cập nhật danh sách bài viết nổi bật dựa trên thuật toán mới nhất" });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi cập nhật bài nổi bật" });
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { fullName, username, email, studentId, class: className, reputation, role } = req.body;
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (username && username !== user.username) {
      const existing = await User.findOne({ where: { username } });
      if (existing) return res.status(400).json({ message: "Username đã tồn tại" });
    }
    if (email && email !== user.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) return res.status(400).json({ message: "Email đã tồn tại" });
    }

    await user.update({ fullName, username, email, studentId, class: className, reputation, role });
    await AuditLog.create({
      userId: req.user.id,
      action: "update_user_info",
      targetType: "user",
      targetId: user.id,
      details: { updatedFields: req.body },
      ipAddress: req.ip,
    });
    res.json({ message: "Đã cập nhật thông tin người dùng", user });
  } catch (err) {
    next(err);
  }
};

module.exports = { 
  getUsers, 
  banUser, 
  unbanUser, 
  changeRole, 
  updateUser,
  togglePinPost, 
  toggleFeaturePost, 
  getAnalytics, 
  getAuditLogs,
  updateFeaturedPostsTrigger,
  getPostsAdmin,
  updatePostAdmin,
  togglePostStatus,
  getAuditAnalytics
};
