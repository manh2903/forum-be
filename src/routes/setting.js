const express = require("express");
const router = express.Router();
const { getSettingByKey, getAllSettings, updateSetting } = require("../controllers/settingController");
const { authenticate, requireRole } = require("../middlewares/auth");

const isAdminOnly = [authenticate, requireRole("admin")];

// Public route to get terms and privacy
router.get("/:key", getSettingByKey);

// Admin routes
router.get("/", ...isAdminOnly, getAllSettings);
router.put("/:key", ...isAdminOnly, updateSetting);

module.exports = router;
