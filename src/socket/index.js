const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const logger = require("../utils/logger");

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
    onlineUsers.set(userId, socket.id);
    logger.info(`User ${userId} connected`);

    socket.join(`user_${userId}`);

    // Broadcast online status
    io.emit("user_online", { userId });

    socket.on("disconnect", () => {
      onlineUsers.delete(userId);
      io.emit("user_offline", { userId });
      logger.info(`User ${userId} disconnected`);
    });

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

function sendNotification(userId, notification) {
  if (io) {
    io.to(`user_${userId}`).emit("notification", notification);
  }
}

module.exports = { initSocket, getIO, sendNotification, onlineUsers };
