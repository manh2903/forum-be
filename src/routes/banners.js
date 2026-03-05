const express = require("express");
const router = express.Router();
const { authenticate, requireRole } = require("../middlewares/auth");
const { listBanners, adminListBanners, createBanner, updateBanner, deleteBanner } = require("../controllers/bannerController");

// Public
router.get("/", listBanners);

// Admin
router.get("/admin", authenticate, requireRole("admin"), adminListBanners);
router.post("/", authenticate, requireRole("admin"), createBanner);
router.put("/:id", authenticate, requireRole("admin"), updateBanner);
router.delete("/:id", authenticate, requireRole("admin"), deleteBanner);

module.exports = router;
