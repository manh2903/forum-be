const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { authenticate, optionalAuth } = require("../middlewares/auth");
const { getProfile, updateProfile, changePassword, followUser, unfollowUser, listUsers, getFollowers, getFollowing, updateFCMToken } = require("../controllers/userController");

router.get("/:id/followers", optionalAuth, getFollowers);
router.get("/:id/following", optionalAuth, getFollowing);
const { listPosts } = require("../controllers/postController");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get("/", optionalAuth, listUsers);
router.get("/:username", optionalAuth, getProfile);
router.get(
  "/:username/posts",
  optionalAuth,
  async (req, res, next) => {
    const { User } = require("../models");
    const user = await User.findOne({ where: { username: req.params.username } });
    if (!user) return res.status(404).json({ message: "User not found" });
    req.query.authorId = user.id;
    next();
  },
  listPosts,
);
router.put("/me", authenticate, upload.single("avatar"), updateProfile);
router.put("/me/password", authenticate, changePassword);
router.put("/me/fcm-token", authenticate, updateFCMToken);
router.post("/:id/follow", authenticate, followUser);
router.delete("/:id/follow", authenticate, unfollowUser);

module.exports = router;
