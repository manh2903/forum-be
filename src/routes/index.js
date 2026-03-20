const express = require("express");
const router = express.Router();

const authRoutes = require("./auth");
const userRoutes = require("./users");
const postRoutes = require("./posts");
const commentRoutes = require("./comments");
const notificationRoutes = require("./notifications");
const topicRoutes = require("./topics");
const searchRoutes = require("./search");
const reportRoutes = require("./reports");
const adminRoutes = require("./admin");
const uploadRoutes = require("./upload");
const bannerRoutes = require("./banners");
const settingRoutes = require("./setting");

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/posts", postRoutes);
router.use("/comments", commentRoutes);
router.use("/notifications", notificationRoutes);
router.use("/topics", topicRoutes);
router.use("/search", searchRoutes);
router.use("/reports", reportRoutes);
router.use("/admin", adminRoutes);
router.use("/upload", uploadRoutes);
router.use("/banners", bannerRoutes);
router.use("/settings", settingRoutes);

module.exports = router;
