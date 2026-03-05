const express = require("express");
const router = express.Router();
const { authenticate, optionalAuth } = require("../middlewares/auth");
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getTopics,
  createTopic,
  updateTopic,
  deleteTopic,
  followTopic,
  getTags,
} = require("../controllers/topicController");
const { requireRole } = require("../middlewares/auth");

router.get("/categories", optionalAuth, getCategories);
router.post("/categories", authenticate, requireRole("admin"), createCategory);
router.put("/categories/:id", authenticate, requireRole("admin"), updateCategory);
router.delete("/categories/:id", authenticate, requireRole("admin"), deleteCategory);

router.get("/", optionalAuth, getTopics);
router.post("/", authenticate, requireRole("admin", "moderator"), createTopic);
router.put("/:id", authenticate, requireRole("admin", "moderator"), updateTopic);
router.delete("/:id", authenticate, requireRole("admin", "moderator"), deleteTopic);

router.post("/:id/follow", authenticate, followTopic);
router.get("/tags", optionalAuth, getTags);

module.exports = router;
