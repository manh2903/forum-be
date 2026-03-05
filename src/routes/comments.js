const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth");
const { updateComment, deleteComment, likeComment } = require("../controllers/commentController");

router.put("/:id", authenticate, updateComment);
router.delete("/:id", authenticate, deleteComment);
router.post("/:id/like", authenticate, likeComment);

module.exports = router;
