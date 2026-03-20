const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middlewares/auth");
const {
  getUsers,
  banUser,
  unbanUser,
  changeRole,
  togglePinPost,
  toggleFeaturePost,
  getAnalytics,
  getAuditLogs,
  updateFeaturedPostsTrigger,
} = require("../controllers/adminController");
const { getReports, resolveReport } = require("../controllers/reportController");

const isAdmin = [authenticate, requireRole("admin", "moderator")];
const isAdminOnly = [authenticate, requireRole("admin")];

router.get("/users", ...isAdmin, getUsers);
router.put("/users/:id/ban", ...isAdmin, banUser);
router.put("/users/:id/unban", ...isAdmin, unbanUser);
router.put("/users/:id/role", ...isAdminOnly, changeRole);
router.put("/posts/:id/pin", ...isAdmin, togglePinPost);
router.put("/posts/:id/feature", ...isAdmin, toggleFeaturePost);
router.post("/posts/update-featured", ...isAdmin, updateFeaturedPostsTrigger);
router.get("/reports", ...isAdmin, getReports);
router.put("/reports/:id", ...isAdmin, resolveReport);
router.get("/analytics", ...isAdmin, getAnalytics);
router.get("/audit-logs", ...isAdminOnly, getAuditLogs);

module.exports = router;
