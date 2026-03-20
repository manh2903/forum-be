const { AuditLog } = require("../models");
const logger = require("../utils/logger");

const getIpAddress = (req) => {
  const ipAddress = req.headers["x-forwarded-for"] || req.connection.remoteAddress || req.socket.remoteAddress || "";
  return ipAddress.includes("::ffff:") ? ipAddress.split("::ffff:")[1] : ipAddress;
};

const sanitizeData = (data) => {
  if (!data) return null;
  const sensitiveFields = ["password", "token", "apiKey", "secret", "authorization", "accessToken", "refreshToken", "currentPassword", "newPassword"];
  
  try {
    let sanitized = typeof data === "string" ? JSON.parse(data) : { ...data };
    
    const mask = (obj) => {
      for (let key in obj) {
        if (sensitiveFields.includes(key)) {
          obj[key] = "****";
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          mask(obj[key]);
        }
      }
    };
    
    mask(sanitized);
    let result = JSON.stringify(sanitized);
    return result.length > 5000 ? result.substring(0, 5000) + "... [truncated]" : result;
  } catch (e) {
    let str = typeof data === "string" ? data : JSON.stringify(data);
    return str.length > 5000 ? str.substring(0, 5000) + "... [truncated]" : str;
  }
};

const auditLogger = async (req, res, next) => {
  // Bỏ qua GET requests trừ phi admin/auth quan trọng?
  // Để đơn giản và giống mẫu, ta log các method thay đổi dữ liệu
  if (req.method === "GET") {
    return next();
  }

  // Danh sách endpoint bỏ qua (nếu có)
  const skipEndpoints = ["/api/notifications/unread-count"];
  if (skipEndpoints.some(ep => req.originalUrl.includes(ep))) {
    return next();
  }

  const startTime = Date.now();
  const ipAddress = getIpAddress(req);
  const userAgent = req.headers["user-agent"];
  
  // Capture response body
  const originalJson = res.json.bind(res);
  let responseBody = null;
  res.json = (data) => {
    responseBody = data;
    return originalJson(data);
  };

  res.on("finish", async () => {
    try {
      const duration = Date.now() - startTime;
      const status = res.statusCode;
      const userId = req.user?.id || null;
      
      let error = null;
      if (status >= 400 && responseBody) {
        error = sanitizeData(responseBody);
      }

      // Tạo logRecord
      await AuditLog.create({
        userId,
        action: `${req.method} ${req.originalUrl.split("?")[0]}`,
        method: req.method,
        endpoint: req.originalUrl,
        requestBody: sanitizeData(req.body),
        status,
        duration,
        ipAddress,
        userAgent,
        error,
      });
    } catch (err) {
      // Dùng winston logger để log lỗi hệ thống
      logger.error("Error saving audit log:", err);
    }
  });

  next();
};

module.exports = auditLogger;
