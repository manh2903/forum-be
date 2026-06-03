const cron = require("node-cron");
const { Op } = require("sequelize");
const { User, Report, AuditLog, Notification } = require("../models");
const logger = require("./logger");
const { sendNotification } = require("../socket");
const { sendBanEmail } = require("./email");

/**
 * Job tự động quét và khóa tài khoản các user vi phạm >= 3 lần trong vòng 30 ngày.
 */
async function checkAndAutoBanUsers() {
  logger.info("[AutoBanJob] Bắt đầu quét người dùng vi phạm...");
  const startTime = Date.now();

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Tìm tất cả user hoạt động (role !== 'admin', isBanned === false, isDeleted === false)
    const activeUsers = await User.findAll({
      where: {
        role: { [Op.ne]: "admin" },
        isBanned: false,
        isDeleted: false
      },
      attributes: ["id", "username", "email"]
    });

    let banCount = 0;

    // 2. Với mỗi user, đếm số báo cáo trạng thái 'resolved' trong 30 ngày qua
    for (const user of activeUsers) {
      const resolvedCount = await Report.count({
        where: {
          targetOwnerId: user.id,
          status: "resolved",
          resolvedAt: { [Op.gte]: thirtyDaysAgo }
        }
      });

      if (resolvedCount >= 3) {
        const banReason = `Tự động khóa do có ${resolvedCount} vi phạm được xác nhận trong vòng 30 ngày`;
        // Khóa tài khoản
        await User.sequelize.transaction(async (t) => {
          await User.update(
            { 
              isBanned: true, 
              banReason 
            }, 
            { where: { id: user.id }, transaction: t }
          );

          // Tạo Audit Log
          await AuditLog.create({
            userId: null, // Hệ thống tự động khóa
            action: "auto_ban_user",
            targetType: "user",
            targetId: user.id,
            details: { 
              banReason: "Tự động khóa do vi phạm >= 3 lần trong vòng 30 ngày (Quét định kỳ)", 
              violationsCount: resolvedCount 
            },
            ipAddress: "127.0.0.1"
          }, { transaction: t });

          // Tạo thông báo cho các Admin/Moderator
          const admins = await User.findAll({ 
            where: { role: ["admin", "moderator"] }, 
            attributes: ["id"],
            transaction: t
          });

          const notifData = admins.map(admin => ({
            recipientId: admin.id,
            senderId: 1, // System ID
            type: "system",
            entityType: "user",
            entityId: user.id,
            content: `Hệ thống tự động khóa tài khoản ${user.username} do có ${resolvedCount} vi phạm được xử lý trong 30 ngày qua.`,
            link: `/admin/users`
          }));

          const createdNotifs = await Notification.bulkCreate(notifData, { transaction: t });
          
          // Gửi thông báo realtime qua Socket nếu đang kết nối
          createdNotifs.forEach(notif => {
            sendNotification(notif.recipientId, notif);
          });
        });

        // Gửi email lý do bị ban cho user
        sendBanEmail(user.email, user.username, banReason);

        logger.info(`[AutoBanJob] Đã khóa tài khoản user: ${user.username} do vi phạm ${resolvedCount} lần.`);
        banCount++;
      }
    }

    const elapsed = Date.now() - startTime;
    logger.info(`[AutoBanJob] Hoàn thành quét! Số tài khoản bị khóa: ${banCount} (Thời gian thực thi: ${elapsed}ms)`);
  } catch (err) {
    logger.error("[AutoBanJob] Lỗi trong quá trình quét tự động khóa tài khoản:", err);
  }
}

/**
 * Khởi tạo cron job tự động khóa tài khoản
 * Chạy mỗi ngày vào lúc 0h00: "0 0 * * *"
 */
function startAutoBanJob() {
  // Chạy quét ngay khi server khởi động
  checkAndAutoBanUsers();

  // Đăng ký lịch quét định kỳ hàng ngày lúc 00:00
  cron.schedule("0 0 * * *", checkAndAutoBanUsers, {
    timezone: "Asia/Ho_Chi_Minh"
  });

  logger.info("[AutoBanJob] Đã đăng ký cron job tự động khóa tài khoản — chạy mỗi ngày lúc 00:00");
}

module.exports = { startAutoBanJob, checkAndAutoBanUsers };
