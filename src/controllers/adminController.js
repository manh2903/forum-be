const { fn, col, literal, Op } = require("sequelize");
const { sequelize } = require("../config/database");
const { User, Post, Comment, Report, AuditLog, Tag, Topic, Notification, SearchHistory } = require("../models");
const { sendNotification, onlineUsers } = require("../socket");
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

    const { count, rows } = await User.unscoped().findAndCountAll({
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

    const updatedUser = await sequelize.transaction(async (t) => {
      await user.update({ isBanned: true, banReason }, { transaction: t });
      await AuditLog.create({
        userId: req.user.id,
        action: "ban_user",
        targetType: "user",
        targetId: user.id,
        details: { banReason },
        ipAddress: req.ip,
      }, { transaction: t });
      return user;
    });

    res.json({ message: "User banned", user: updatedUser });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/users/:id/unban
const unbanUser = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const updatedUser = await sequelize.transaction(async (t) => {
      await user.update({ isBanned: false, banReason: null }, { transaction: t });
      await AuditLog.create({ 
        userId: req.user.id, 
        action: "unban_user", 
        targetType: "user", 
        targetId: user.id, 
        ipAddress: req.ip 
      }, { transaction: t });
      return user;
    });

    res.json({ message: "User unbanned", user: updatedUser });
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

    const updatedUser = await sequelize.transaction(async (t) => {
      await user.update({ role }, { transaction: t });
      await AuditLog.create({
        userId: req.user.id,
        action: "change_role",
        targetType: "user",
        targetId: user.id,
        details: { role },
        ipAddress: req.ip,
      }, { transaction: t });
      return user;
    });

    res.json({ message: "Role updated", user: updatedUser });
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
    
    if (status === "deleted") {
      where.isDeleted = true;
    } else {
      where.isDeleted = false; // Mặc định ẩn đã xóa trừ khi chọn filter Deleted
      if (status) where.status = status;
    }

    const { count, rows } = await Post.unscoped().findAndCountAll({
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
    const counts = await Post.unscoped().findAll({
      attributes: [
        [literal("CASE WHEN isDeleted = 1 THEN 'deleted' ELSE status END"), "status_label"],
        [fn("COUNT", col("id")), "count"]
      ],
      group: ["status_label"],
      raw: true,
    });

    res.json({ 
      posts: rows, 
      total: count, 
      page: parseInt(page), 
      totalPages: Math.ceil(count / parseInt(limit)),
      counts: counts.reduce((acc, curr) => {
        const c = Number(curr.count);
        acc[curr.status_label] = c;
        acc.total = (acc.total || 0) + c;
        return acc;
      }, { total: 0 })
    });
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

    const updatedPost = await sequelize.transaction(async (t) => {
      await post.update({ title, content, topicId, status, isPinned, isFeatured }, { transaction: t });
      await AuditLog.create({
        userId: req.user.id,
        action: "update_post_admin",
        targetType: "post",
        targetId: post.id,
        details: { updatedFields: req.body },
        ipAddress: req.ip,
      }, { transaction: t });
      return post;
    });

    res.json({ message: "Đã cập nhật bài viết", post: updatedPost });
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

    const [userGrowth, postGrowth, postStats] = await Promise.all([
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
      }),
      Post.findOne({
        attributes: [
          [fn("SUM", col("viewCount")), "totalViews"],
          [fn("SUM", col("likeCount")), "totalLikes"]
        ],
        where: { isDeleted: false },
        raw: true
      })
    ]);

    const totalViews = postStats?.totalViews || 0;
    const totalLikes = postStats?.totalLikes || 0;
    const engagementRate = totalViews > 0 ? (totalLikes / totalViews) * 100 : 0;

    // Top Tags
    const topTags = await Tag.findAll({
      attributes: ["id", "name", [fn("COUNT", col("posts.id")), "postCount"]],
      include: [{ model: Post, as: "posts", attributes: [], through: { attributes: [] } }],
      group: ["Tag.id"],
      order: [[fn("COUNT", col("posts.id")), "DESC"]],
      limit: 10,
      subQuery: false
    });

    // Top Searches
    const topSearches = await SearchHistory.findAll({
      attributes: [
        "query",
        [fn("COUNT", col("query")), "count"],
        [fn("MAX", col("createdAt")), "latest"]
      ],
      group: ["query"],
      order: [[fn("COUNT", col("query")), "DESC"]],
      limit: 10,
      raw: true
    });

    // Engagement by Topic
    const engagementByTopic = await Post.findAll({
      attributes: [
        "topicId",
        [fn("COUNT", col("Post.id")), "postCount"],
        [fn("AVG", col("viewCount")), "avgViews"],
        [fn("AVG", col("likeCount")), "avgLikes"],
        [fn("AVG", col("commentCount")), "avgComments"],
        [fn("SUM", col("viewCount")), "totalViews"],
        [fn("SUM", col("likeCount")), "totalLikes"]
      ],
      include: [{ model: Topic, as: "topic", attributes: ["name"] }],
      where: { isDeleted: false },
      group: ["topicId", "topic.id"],
      order: [[fn("COUNT", col("Post.id")), "DESC"]],
      raw: true,
      nest: true
    });

    res.json({
      overview: { 
        userCount,
        postCount,
        commentCount,
        pendingReports: reportCount,
        newUsersWeek: newUsers,
        newPostsWeek: newPosts,
        resolvedReports: await Report.count({ where: { status: "resolved" } }),
        engagementRate: engagementRate.toFixed(1),
        onlineCount: onlineUsers.size,
        offlineCount: Math.max(0, userCount - onlineUsers.size)
      },
      engagementByTopic,
      topPosts,
      topUsers,
      topTags,
      topSearches,
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
          [col("AuditLog.userId"), "userId"],
          [fn("COUNT", col("AuditLog.id")), "count"],
        ],
        include: [{ model: User, as: "user", attributes: ["username", "avatar"] }],
        group: ["AuditLog.userId", "user.id"],
        order: [[fn("COUNT", col("AuditLog.id")), "DESC"]],
        limit: 5,
      }),
      AuditLog.findAll({
        where: { createdAt: { [Op.gte]: thirtyDaysAgo } },
        attributes: [
          [fn("DATE", col("AuditLog.createdAt")), "date"],
          [fn("COUNT", col("AuditLog.id")), "count"],
          [fn("SUM", literal("CASE WHEN status >= 400 THEN 1 ELSE 0 END")), "errors"]
        ],
        group: [fn("DATE", col("AuditLog.createdAt"))],
        order: [[fn("DATE", col("AuditLog.createdAt")), "ASC"]],
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

const approvePost = async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const result = await sequelize.transaction(async (t) => {
      const isFirstPublished = !post.publishedAt;
      await post.update({ status: "published", publishedAt: post.publishedAt || new Date() }, { transaction: t });

      if (isFirstPublished) {
        await User.increment("reputation", { by: 5, where: { id: post.authorId }, transaction: t });
      }

      const notif = await Notification.create({
        recipientId: post.authorId,
        senderId: req.user.id,
        type: "system",
        content: `Bài viết "${post.title}" của bạn đã được phê duyệt!`,
        link: `/posts/${post.slug}`,
        slug: post.slug,
      }, { transaction: t });

      await AuditLog.create({
        userId: req.user.id,
        action: "approve_post",
        targetType: "post",
        targetId: post.id,
        ipAddress: req.ip,
      }, { transaction: t });

      return { post, notif };
    });

    sendNotification(post.authorId, result.notif);
    res.json({ message: "Bài viết đã được phê duyệt", post: result.post });
  } catch (err) {
    next(err);
  }
};

const rejectPost = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const result = await sequelize.transaction(async (t) => {
      await post.update({ status: "rejected" }, { transaction: t });

      const notif = await Notification.create({
        recipientId: post.authorId,
        senderId: req.user.id,
        type: "system",
        content: `Bài viết "${post.title}" của bạn bị từ chối phê duyệt${reason ? `: ${reason}` : ""}.`,
        link: `/posts/edit/${post.id}`,
        slug: post.slug,
      }, { transaction: t });

      await AuditLog.create({
        userId: req.user.id,
        action: "reject_post",
        targetType: "post",
        targetId: post.id,
        details: { reason },
        ipAddress: req.ip,
      }, { transaction: t });

      return { post, notif };
    });

    sendNotification(post.authorId, result.notif);
    res.json({ message: "Bài viết đã bị từ chối", post: result.post });
  } catch (err) {
    next(err);
  }
};

const restorePost = async (req, res, next) => {
  try {
    const post = await Post.unscoped().findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const updatedPost = await sequelize.transaction(async (t) => {
      await post.update({ isDeleted: false }, { transaction: t });
      await AuditLog.create({
        userId: req.user.id,
        action: "restore_post",
        targetType: "post",
        targetId: post.id,
        ipAddress: req.ip,
      }, { transaction: t });
      return post;
    });

    res.json({ message: "Đã khôi phục bài viết thành công", post: updatedPost });
  } catch (err) {
    next(err);
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

    const updatedUser = await sequelize.transaction(async (t) => {
      await user.update({ fullName, username, email, studentId, class: className, reputation, role }, { transaction: t });
      await AuditLog.create({
        userId: req.user.id,
        action: "update_user_info",
        targetType: "user",
        targetId: user.id,
        details: { updatedFields: req.body },
        ipAddress: req.ip,
      }, { transaction: t });
      return user;
    });

    res.json({ message: "Đã cập nhật thông tin người dùng", user: updatedUser });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/notifications
const sendAdminNotification = async (req, res, next) => {
  try {
    const { recipientId, recipientIds, type = "system", content, link = "/" } = req.body;
    
    let targets = [];
    let isMass = false;

    if (recipientIds && Array.isArray(recipientIds) && recipientIds.length > 0) {
      // Gửi cho một nhóm ID
      targets = await User.findAll({ 
        where: { id: recipientIds, isDeleted: false },
        attributes: ["id"]
      });
    } else if (recipientId) {
      // Gửi cho 1 người cụ thể
      targets = [{ id: recipientId }];
    } else {
      // Gửi cho tất cả người dùng hoạt động
      targets = await User.findAll({ 
        where: { isDeleted: false, isBanned: false }, 
        attributes: ["id"] 
      });
      isMass = true;
    }

    if (targets.length === 0) return res.status(400).json({ message: "Không tìm thấy người nhận" });

    const notifs = targets.map(u => ({
      recipientId: u.id,
      senderId: req.user.id,
      type,
      content,
      link,
    }));

    // Chia nhỏ bulkCreate nếu số lượng quá lớn (ví dụ > 5000), nhưng hiện tại database thông thường chịu được hàng nghìn
    await Notification.bulkCreate(notifs);

    // Gửi thông báo realtime (Cả qua Socket và FCM)
    targets.forEach(u => {
      sendNotification(u.id, { 
        senderId: req.user.id, 
        type, 
        content, 
        link,
        sender: { id: req.user.id, username: req.user.username, avatar: req.user.avatar }
      });
    });

    // Audit Log
    await AuditLog.create({
      userId: req.user.id,
      action: isMass ? "send_mass_notification" : "send_group_notification",
      targetType: isMass ? "all_users" : "specific_users",
      details: { content, link, recipientCount: targets.length },
      ipAddress: req.ip,
    });

    res.json({ message: `Đã gửi thông báo thành công cho ${targets.length} người dùng` });
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
  getAuditAnalytics,
  approvePost,
  rejectPost,
  restorePost,
  sendAdminNotification
};
