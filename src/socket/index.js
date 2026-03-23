const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const logger = require("../utils/logger");
const { sendFCMNotification } = require("../config/firebase");

let io;
const onlineUsers = new Map();

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("Auth required"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      if (!user) return next(new Error("User not found"));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
      io.emit("user_online", { userId });
      io.emit("presence_update", { onlineCount: onlineUsers.size });
    }
    onlineUsers.get(userId).add(socket.id);

    logger.info(`User ${userId} connected. Total sockets: ${onlineUsers.get(userId).size}`);

    socket.join(`user_${userId}`);

    socket.on("disconnect", () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit("user_offline", { userId });
          io.emit("presence_update", { onlineCount: onlineUsers.size });
          logger.info(`User ${userId} fully disconnected`);
        } else {
          logger.info(`User ${userId} closed 1 tab. Remaining: ${userSockets.size}`);
        }
      }
    });

    socket.emit("presence_update", { onlineCount: onlineUsers.size });

    socket.on("join_post", (postId) => {
      socket.join(`post_${postId}`);
    });

    socket.on("leave_post", (postId) => {
      socket.leave(`post_${postId}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

async function sendNotification(userId, notification) {
  if (io) {
    io.to(`user_${userId}`).emit("notification", notification);
  }

  try {
    const user = await User.findByPk(userId, { attributes: ["id", "fcmToken"] });
    if (user && user.fcmToken) {
      await sendFCMNotification(user.fcmToken, {
        title: "Thông báo mới",
        body: notification.content || "Bạn có thông báo mới",
        data: {
          link: notification.link || "",
          id: String(notification.id || ""),
        },
      });
    }
  } catch (error) {
    logger.error("Error sending FCM in sendNotification:", error);
  }
}

module.exports = { initSocket, getIO, sendNotification, onlineUsers };
