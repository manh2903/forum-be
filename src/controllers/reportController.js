const { Report, User, Post, Comment, Notification } = require("../models");
const { sendNotification } = require("../socket");

// POST /api/reports
const createReport = async (req, res, next) => {
  try {
    const { targetType, targetId, reason, description } = req.body;

    const existing = await Report.findOne({ where: { reporterId: req.user.id, targetType, targetId } });
    if (existing) return res.status(409).json({ message: "You already reported this content" });

    const report = await Report.create({ reporterId: req.user.id, targetType, targetId, reason, description });
    res.status(201).json({ report, message: "Report submitted successfully" });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/reports
const getReports = async (req, res, next) => {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await Report.findAndCountAll({
      where: status !== "all" ? { status } : {},
      include: [
        { model: User, as: "reporter", attributes: ["id", "username", "avatar"] },
        { model: User, as: "resolver", attributes: ["id", "username"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset,
    });
    res.json({ reports: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
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

    await report.update({ status, resolution, resolvedById: req.user.id, resolvedAt: new Date() });

    // Notify reporter
    const notif = await Notification.create({
      recipientId: report.reporterId,
      senderId: req.user.id,
      type: "report_resolved",
      content: `Your report has been ${status}: ${resolution || ""}`,
      entityType: "report",
      entityId: report.id,
    });
    sendNotification(report.reporterId, notif);

    // Audit log
    const { AuditLog } = require("../models");
    await AuditLog.create({
      adminId: req.user.id,
      action: "resolve_report",
      targetType: "report",
      targetId: report.id,
      details: { status, resolution },
      ipAddress: req.ip,
    });

    res.json({ report });
  } catch (err) {
    next(err);
  }
};

module.exports = { createReport, getReports, resolveReport };
