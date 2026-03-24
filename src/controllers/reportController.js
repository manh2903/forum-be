const { Report, User, Post, Comment, Notification, AuditLog } = require("../models");
const { sequelize } = require("../config/database");
const { sendNotification, getIO } = require("../socket");

// POST /api/reports
const createReport = async (req, res, next) => {
  try {
    const { targetType, targetId, reason, description } = req.body;

    const existing = await Report.findOne({ where: { reporterId: req.user.id, targetType, targetId } });
    if (existing) return res.status(409).json({ message: "Bạn đã báo cáo nội dung này" });

    // Validate target and get ownerId
    let targetOwnerId = null;
    if (targetType === 'post') {
      const post = await Post.findByPk(targetId);
      if (!post) return res.status(404).json({ message: "Bài viết không tồn tại" });
      targetOwnerId = post.authorId;
    } else if (targetType === 'comment') {
      const comment = await Comment.findByPk(targetId);
      if (!comment) return res.status(404).json({ message: "Bình luận không tồn tại" });
      targetOwnerId = comment.authorId;
    } else if (targetType === 'user') {
      const user = await User.findByPk(targetId);
      if (!user) return res.status(404).json({ message: "Người dùng không tồn tại" });
      targetOwnerId = user.id;
    }

    const report = await Report.create({ 
      reporterId: req.user.id, targetType, targetId, targetOwnerId, reason, description 
    });

    // Notify admins
    const admins = await User.findAll({ where: { role: ["admin", "moderator"] }, attributes: ["id"] });
    const notifData = admins.map(admin => ({
      recipientId: admin.id,
      senderId: req.user.id,
      type: "new_report",
      entityType: "report",
      entityId: report.id,
      content: `Báo cáo mới về bài viết/bình luận cần được xử lý: "${reason}"`,
      link: `/admin/reports`,
    }));
    const createdNotifs = await Notification.bulkCreate(notifData);
    
    createdNotifs.forEach(notif => {
      sendNotification(notif.recipientId, notif);
    });

    getIO().to("staff").emit("new_report", { report });

    res.status(201).json({ report, message: "Báo cáo thành công" });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/reports
const getReports = async (req, res, next) => {
  try {
    const { status = "all", page = 1, limit = 15 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { isDeleted: false };
    if (status && status !== "all") {
      where.status = status;
    }

    const { count, rows } = await Report.unscoped().findAndCountAll({
      where,
      include: [
        { model: User.unscoped(), as: "reporter", attributes: ["id", "username", "avatar"], required: false },
        { model: User.unscoped(), as: "resolver", attributes: ["id", "username"], required: false },
        { model: User.unscoped(), as: "targetOwner", attributes: ["id", "username", "avatar"], required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset,
    });

    // Enrich with target content
    const enrichedReports = await Promise.all(rows.map(async (report) => {
      const plainReport = report.get({ plain: true });
      let target = null;
      try {
        if (report.targetType === 'post') {
          target = await Post.unscoped().findByPk(report.targetId, { attributes: ['id', 'title', 'slug', 'isDeleted'] });
        } else if (report.targetType === 'comment') {
          target = await Comment.unscoped().findByPk(report.targetId, { 
            include: [{ model: User.unscoped(), as: 'author', attributes: ['username'] }],
            attributes: ['id', 'content', 'isDeleted']
          });
        } else if (report.targetType === 'user') {
          target = await User.unscoped().findByPk(report.targetId, { attributes: ['id', 'username', 'avatar', 'isDeleted'] });
        }
      } catch (err) {}
      return { ...plainReport, target };
    }));

    res.json({ reports: enrichedReports, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/reports/:id
const resolveReport = async (req, res, next) => {
  try {
    const { status, resolution } = req.body;
    const report = await Report.findByPk(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    const result = await sequelize.transaction(async (t) => {
      await report.update({ status, resolution, resolvedById: req.user.id, resolvedAt: new Date() }, { transaction: t });

      const notif = await Notification.create({
        recipientId: report.reporterId,
        senderId: req.user.id,
        type: "report_resolved",
        content: `Báo cáo của bạn đã được ${status === 'resolved' ? 'xử lý' : 'bỏ qua'}: ${resolution || ""}`,
        entityType: "report",
        entityId: report.id,
      }, { transaction: t });

      await AuditLog.create({
        userId: req.user.id,
        action: "resolve_report",
        targetType: "report",
        targetId: report.id,
        details: { status, resolution },
        ipAddress: req.ip,
      }, { transaction: t });

      return { report, notif };
    });

    sendNotification(report.reporterId, result.notif);
    res.json({ report: result.report });
  } catch (err) {
    next(err);
  }
};

// GET /api/reports
const getMyReports = async (req, res, next) => {
  try {
    const { page = 1, limit = 15 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Report.findAndCountAll({
      where: { reporterId: req.user.id, isDeleted: false },
      include: [
        { model: User.unscoped(), as: "resolver", attributes: ["id", "username"], required: false },
        { model: User.unscoped(), as: "targetOwner", attributes: ["id", "username", "avatar"], required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset,
    });

    const enrichedReports = await Promise.all(rows.map(async (report) => {
      const plainReport = report.get({ plain: true });
      let target = null;
      try {
        if (report.targetType === 'post') {
          target = await Post.unscoped().findByPk(report.targetId, { attributes: ['id', 'title', 'slug', 'isDeleted'] });
        } else if (report.targetType === 'comment') {
          target = await Comment.unscoped().findByPk(report.targetId, { 
            include: [{ model: User.unscoped(), as: 'author', attributes: ['username'] }],
            attributes: ['id', 'content', 'isDeleted']
          });
        } else if (report.targetType === 'user') {
          target = await User.unscoped().findByPk(report.targetId, { attributes: ['id', 'username', 'avatar', 'isDeleted'] });
        }
      } catch (err) {}
      return { ...plainReport, target };
    }));

    res.json({ reports: enrichedReports, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

module.exports = { createReport, getReports, resolveReport, getMyReports };
