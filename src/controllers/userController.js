const { Op } = require("sequelize");
const { User, Follow, Post, Badge, UserBadge } = require("../models");

// GET /api/users/:username
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findOne({
      where: { username: req.params.username },
      attributes: { exclude: ["password", "resetPasswordToken", "resetPasswordExpires", "googleId", "githubId"] },
      include: [{ model: Badge, as: "badges", through: { attributes: ["awardedAt"] } }],
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const followerCount = await Follow.count({ where: { followingId: user.id } });
    const followingCount = await Follow.count({ where: { followerId: user.id } });

    // Detailed post counts
    const isOwner = req.user && req.user.id === user.id;
    const isAdmin = req.user && (req.user.role === 'admin' || req.user.role === 'moderator');
    
    // Everyone sees published count
    const publishedCount = await Post.count({ where: { authorId: user.id, status: "published" } });
    
    let stats = { postCount: publishedCount, followerCount, followingCount, isFollowing: false };

    // Owners and Admins see additional counts
    if (isOwner || isAdmin) {
      const [pendingCount, rejectedCount, draftCount] = await Promise.all([
        Post.count({ where: { authorId: user.id, status: "pending" } }),
        Post.count({ where: { authorId: user.id, status: "rejected" } }),
        Post.count({ where: { authorId: user.id, status: "draft" } }),
      ]);
      stats = { 
        ...stats, 
        pendingCount, 
        rejectedCount, 
        draftCount, 
        totalPostCount: publishedCount + pendingCount + rejectedCount + draftCount 
      };
    }

    if (req.user) {
      stats.isFollowing = !!(await Follow.findOne({ where: { followerId: req.user.id, followingId: user.id } }));
    }

    res.json({ user: { ...user.toJSON(), ...stats } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/users/me
const updateProfile = async (req, res, next) => {
  try {
    const { fullName, bio, website, location, jobTitle, githubUrl, twitterUrl, emailNotifications, studentId, class: className, avatar } = req.body;

    if (studentId && studentId !== req.user.studentId) {
      const existing = await User.findOne({ where: { studentId } });
      if (existing) return res.status(400).json({ message: "Mã sinh viên này đã được sử dụng bởi người dùng khác" });
    }

    const updateData = { fullName, bio, website, location, jobTitle, githubUrl, twitterUrl, emailNotifications, studentId, class: className, avatar };
    if (req.file) updateData.avatar = `/uploads/${req.file.filename}`;

    await req.user.update(updateData);
    res.json({ user: req.user.toPublicJSON() });
  } catch (err) {
    next(err);
  }
};

// PUT /api/users/me/password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!req.user.password) return res.status(400).json({ message: "OAuth account cannot change password this way" });
    const valid = await req.user.comparePassword(currentPassword);
    if (!valid) return res.status(400).json({ message: "Current password incorrect" });
    await req.user.update({ password: newPassword });
    res.json({ message: "Password updated" });
  } catch (err) {
    next(err);
  }
};

// POST /api/users/:id/follow
const followUser = async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.id) return res.status(400).json({ message: "Cannot follow yourself" });
    const target = await User.findByPk(targetId);
    if (!target) return res.status(404).json({ message: "User not found" });

    const [, created] = await Follow.findOrCreate({
      where: { followerId: req.user.id, followingId: targetId },
    });
    if (!created) return res.status(409).json({ message: "Already following" });

    // Create notification
    const { Notification } = require("../models");
    const { sendNotification } = require("../socket");
    const notif = await Notification.create({
      recipientId: targetId,
      senderId: req.user.id,
      type: "follow",
      content: `${req.user.username} đã bắt đầu theo dõi bạn`,
      link: `/profile/${req.user.username}`,
      slug: req.user.username,
    });
    sendNotification(targetId, { ...notif.toJSON(), sender: { id: req.user.id, username: req.user.username, avatar: req.user.avatar } });

    res.json({ message: "Followed successfully" });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/users/:id/follow
const unfollowUser = async (req, res, next) => {
  try {
    const deleted = await Follow.destroy({ where: { followerId: req.user.id, followingId: req.params.id } });
    if (!deleted) return res.status(404).json({ message: "Not following" });
    res.json({ message: "Unfollowed successfully" });
  } catch (err) {
    next(err);
  }
};

// GET /api/users
const listUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const where = {};
    if (search) where.username = { [Op.like]: `%${search}%` };

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ["password", "resetPasswordToken", "resetPasswordExpires", "googleId", "githubId", "banReason"] },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["reputation", "DESC"]],
    });

    let follows = new Set();
    if (req.user && rows.length > 0) {
      const followData = await Follow.findAll({
        where: { followerId: req.user.id, followingId: rows.map((u) => u.id) },
        attributes: ["followingId"],
      });
      follows = new Set(followData.map((f) => f.followingId));
    }

    const users = rows.map((u) => ({
      ...u.toJSON(),
      isFollowing: follows.has(u.id),
    }));

    res.json({ users, total: count, page: parseInt(page), totalPages: Math.ceil(count / limit) });
  } catch (err) {
    next(err);
  }
};

// GET /api/users/:id/followers
const getFollowers = async (req, res, next) => {
  try {
    const followers = await Follow.findAll({
      where: { followingId: req.params.id },
      include: [{ model: User, as: "follower", attributes: ["id", "username", "fullName", "avatar", "reputation", "role"] }],
    });

    const userList = followers.map((f) => f.follower);
    let follows = new Set();
    if (req.user && userList.length > 0) {
      const followData = await Follow.findAll({
        where: { followerId: req.user.id, followingId: userList.map((u) => u.id) },
        attributes: ["followingId"],
      });
      follows = new Set(followData.map((f) => f.followingId));
    }

    const result = userList.map((u) => ({
      ...u.toJSON(),
      isFollowing: follows.has(u.id),
    }));

    res.json({ users: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/users/:id/following
const getFollowing = async (req, res, next) => {
  try {
    const following = await Follow.findAll({
      where: { followerId: req.params.id },
      include: [{ model: User, as: "following", attributes: ["id", "username", "fullName", "avatar", "reputation", "role"] }],
    });

    const userList = following.map((f) => f.following);
    let follows = new Set();
    if (req.user && userList.length > 0) {
      const followData = await Follow.findAll({
        where: { followerId: req.user.id, followingId: userList.map((u) => u.id) },
        attributes: ["followingId"],
      });
      follows = new Set(followData.map((f) => f.followingId));
    }

    const result = userList.map((u) => ({
      ...u.toJSON(),
      isFollowing: follows.has(u.id),
    }));

    res.json({ users: result });
  } catch (err) {
    next(err);
  }
};

// PUT /api/users/me/fcm-token
const updateFCMToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    await req.user.update({ fcmToken: token || null });
    res.json({ message: "FCM Token updated" });
  } catch (err) {
    next(err);
  }
};

module.exports = { 
  getProfile, updateProfile, changePassword, followUser, 
  unfollowUser, listUsers, getFollowers, getFollowing,
  updateFCMToken
};
