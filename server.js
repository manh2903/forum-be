const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const passport = require("passport");
require("dotenv").config();

const { sequelize } = require("./src/config/database");
const { initSocket } = require("./src/socket");
const routes = require("./src/routes");
const { errorHandler } = require("./src/middlewares/errorHandler");
const logger = require("./src/utils/logger");
const { startFeaturedJob } = require("./src/utils/featuredJob");

require("./src/config/passport");

const app = express();
const server = http.createServer(app);

// Init Socket.IO
initSocket(server);

// Middlewares
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(compression());
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static("uploads"));
app.use(passport.initialize());

const auditLogger = require("./src/middlewares/auditLogger");

// Routes
app.use("/api", auditLogger, routes);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", time: new Date() }));

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info("Database connected");
    await sequelize.sync(); // Chỉ tạo bảng mới (như AuditLogs vừa drop), không ALTER bảng cũ (như Users)
    logger.info("Database synced");

    // Khởi động cron job cập nhật bài viết nổi bật
    startFeaturedJob();

    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
