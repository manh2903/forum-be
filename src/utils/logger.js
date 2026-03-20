const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Tạo thư mục logs nếu chưa có
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: "info",
  format: fileFormat,
  transports: [
    // Console: hiển thị màu, dễ đọc khi dev
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),

    // File: lưu tất cả log (info, warn, error)
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 10 * 1024 * 1024, // 10MB mỗi file
      maxFiles: 14,               // Giữ tối đa 14 file (tương đương ~14 ngày)
      tailable: true,
    }),

    // File: chỉ lưu error
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 10 * 1024 * 1024,
      maxFiles: 30,
      tailable: true,
    }),
  ],
});

module.exports = logger;
