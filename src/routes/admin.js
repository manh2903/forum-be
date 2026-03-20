const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middlewares/auth");
const {
  getUsers,
  banUser,
  unbanUser,
  changeRole,
  updateUser,
  togglePinPost,
  toggleFeaturePost,
  getAnalytics,
  getAuditLogs,
  getAuditAnalytics,
  updateFeaturedPostsTrigger,
  getPostsAdmin,
  updatePostAdmin,
  togglePostStatus,
  approvePost,
  rejectPost,
  restorePost,
} = require("../controllers/adminController");
const { getReports, resolveReport } = require("../controllers/reportController");

const isAdmin = [authenticate, requireRole("admin", "moderator")];
const isAdminOnly = [authenticate, requireRole("admin")];

router.get("/users", ...isAdmin, getUsers);
router.put("/users/:id/ban", ...isAdmin, banUser);
router.put("/users/:id/unban", ...isAdmin, unbanUser);
router.put("/users/:id/role", ...isAdminOnly, changeRole);
router.put("/users/:id", ...isAdminOnly, updateUser);
router.get("/posts", ...isAdmin, getPostsAdmin);
router.put("/posts/:id", ...isAdmin, updatePostAdmin);
router.put("/posts/:id/status", ...isAdmin, togglePostStatus);
router.put("/posts/:id/pin", ...isAdmin, togglePinPost);
router.put("/posts/:id/feature", ...isAdmin, toggleFeaturePost);
router.put("/posts/:id/approve", ...isAdmin, approvePost);
router.put("/posts/:id/reject", ...isAdmin, rejectPost);
router.put("/posts/:id/restore", ...isAdmin, restorePost);
router.post("/posts/update-featured", ...isAdmin, updateFeaturedPostsTrigger);
router.get("/reports", ...isAdmin, getReports);
router.put("/reports/:id", ...isAdmin, resolveReport);
router.get("/analytics", ...isAdmin, getAnalytics);
router.get("/audit-logs", ...isAdminOnly, getAuditLogs);
router.get("/audit-analytics", ...isAdminOnly, getAuditAnalytics);

module.exports = router;
