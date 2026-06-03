const { Report, User, Post, Comment, Notification, AuditLog } = require("../models");
const { sequelize } = require("../config/database");
const { sendNotification, getIO } = require("../socket");
const { Op } = require("sequelize");
const { sendBanEmail } = require("../utils/email");

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
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const defaultMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const defaultYear = `${now.getFullYear()}`;

    const { 
      status = "all", 
      page = 1, 
      limit = 15, 
      statsDate = defaultDate, 
      statsMonth = defaultMonth, 
      statsYear = defaultYear, 
      filterType 
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { isDeleted: false };
    if (status && status !== "all") {
      where.status = status;
    }

    if (filterType === 'day' && statsDate) {
      const dStart = new Date(statsDate);
      dStart.setHours(0,0,0,0);
      const dEnd = new Date(dStart);
      dEnd.setHours(23,59,59,999);
      if (status === 'resolved' || status === 'dismissed') {
        where.resolvedAt = { [Op.between]: [dStart, dEnd] };
      } else {
        where.createdAt = { [Op.between]: [dStart, dEnd] };
      }
    } else if (filterType === 'month' && statsMonth) {
      const [y, m] = statsMonth.split("-");
      const mStart = new Date(parseInt(y), parseInt(m) - 1, 1);
      mStart.setHours(0,0,0,0);
      const mEnd = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0);
      mEnd.setHours(23,59,59,999);
      if (status === 'resolved' || status === 'dismissed') {
        where.resolvedAt = { [Op.between]: [mStart, mEnd] };
      } else {
        where.createdAt = { [Op.between]: [mStart, mEnd] };
      }
    } else if (filterType === 'year' && statsYear) {
      const yStart = new Date(parseInt(statsYear), 0, 1);
      yStart.setHours(0,0,0,0);
      const yEnd = new Date(yStart.getFullYear(), 11, 31);
      yEnd.setHours(23,59,59,999);
      if (status === 'resolved' || status === 'dismissed') {
        where.resolvedAt = { [Op.between]: [yStart, yEnd] };
      } else {
        where.createdAt = { [Op.between]: [yStart, yEnd] };
      }
    }

    const { count, rows } = await Report.unscoped().findAndCountAll({
      where,
      include: [
        { 
          model: User.unscoped(), 
          as: "reporter", 
          attributes: ["id", "username", "avatar", "fullName", "email", "studentId", "class", "reputation", "role", "isVerified"], 
          required: false 
        },
        { 
          model: User.unscoped(), 
          as: "resolver", 
          attributes: ["id", "username"], 
          required: false 
        },
        { 
          model: User.unscoped(), 
          as: "targetOwner", 
          attributes: ["id", "username", "avatar", "fullName", "email", "studentId", "class", "reputation", "role", "isVerified", "isBanned", "banReason"], 
          required: false 
        },
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

    // Calculate stats based on statsDate, statsMonth, statsYear
    const targetDateStart = new Date(statsDate);
    targetDateStart.setHours(0,0,0,0);
    const targetDateEnd = new Date(targetDateStart);
    targetDateEnd.setHours(23,59,59,999);

    const [yVal, mVal] = statsMonth.split("-");
    const targetMonthStart = new Date(parseInt(yVal), parseInt(mVal) - 1, 1);
    targetMonthStart.setHours(0,0,0,0);
    const targetMonthEnd = new Date(targetMonthStart.getFullYear(), targetMonthStart.getMonth() + 1, 0);
    targetMonthEnd.setHours(23,59,59,999);

    const targetYearStart = new Date(parseInt(statsYear), 0, 1);
    targetYearStart.setHours(0,0,0,0);
    const targetYearEnd = new Date(targetYearStart.getFullYear(), 11, 31);
    targetYearEnd.setHours(23,59,59,999);

    const [violationsToday, violationsMonth, violationsYear] = await Promise.all([
      Report.count({ where: { status: "resolved", resolvedAt: { [Op.between]: [targetDateStart, targetDateEnd] }, isDeleted: false } }),
      Report.count({ where: { status: "resolved", resolvedAt: { [Op.between]: [targetMonthStart, targetMonthEnd] }, isDeleted: false } }),
      Report.count({ where: { status: "resolved", resolvedAt: { [Op.between]: [targetYearStart, targetYearEnd] }, isDeleted: false } }),
    ]);

    res.json({ 
      reports: enrichedReports, 
      total: count, 
      page: parseInt(page), 
      totalPages: Math.ceil(count / parseInt(limit)),
      stats: {
        today: violationsToday,
        month: violationsMonth,
        year: violationsYear
      }
    });
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

    let autoBannedUser = null;
    let autoBanReason = null;

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

      // Auto-ban check if report is resolved and there is a target owner
      if (status === "resolved" && report.targetOwnerId) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const resolvedCount = await Report.count({
          where: {
            targetOwnerId: report.targetOwnerId,
            status: "resolved",
            resolvedAt: { [Op.gte]: thirtyDaysAgo }
          },
          transaction: t
        });

        if (resolvedCount >= 3) {
          const user = await User.findByPk(report.targetOwnerId, { transaction: t });
          if (user && user.role !== "admin" && !user.isBanned) {
            const banReason = `Tự động khóa do vi phạm >= 3 lần trong vòng 30 ngày (${resolvedCount} vi phạm được xác nhận)`;
            await user.update({ 
              isBanned: true, 
              banReason 
            }, { transaction: t });
            autoBannedUser = user;
            autoBanReason = banReason;

            // Create system auto ban audit log
            await AuditLog.create({
              userId: null, // System auto ban
              action: "auto_ban_user",
              targetType: "user",
              targetId: user.id,
              details: { 
                banReason: "Tự động khóa do vi phạm >= 3 lần trong vòng 30 ngày (Sau khi giải quyết báo cáo)", 
                violationsCount: resolvedCount 
              },
              ipAddress: req.ip || "127.0.0.1",
            }, { transaction: t });

            // Notify all admins and moderators
            const admins = await User.findAll({ 
              where: { role: ["admin", "moderator"] }, 
              attributes: ["id"],
              transaction: t
            });

            const systemNotifications = admins.map(admin => ({
              recipientId: admin.id,
              senderId: 1, // System
              type: "system",
              entityType: "user",
              entityId: user.id,
              content: `Hệ thống tự động khóa tài khoản ${user.username} do có ${resolvedCount} vi phạm được xử lý trong 30 ngày qua.`,
              link: `/admin/users`
            }));

            const createdNotifs = await Notification.bulkCreate(systemNotifications, { transaction: t });
            
            // Send socket real-time notifications to admins
            createdNotifs.forEach(notif => {
              sendNotification(notif.recipientId, notif);
            });
          }
        }
      }

      return { report, notif };
    });

    sendNotification(report.reporterId, result.notif);
    if (autoBannedUser) {
      sendBanEmail(autoBannedUser.email, autoBannedUser.username, autoBanReason);
    }
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
