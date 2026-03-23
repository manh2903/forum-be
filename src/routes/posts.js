const express = require("express");
const router = express.Router();
const { authenticate, optionalAuth } = require("../middlewares/auth");
const { 
  listPosts, getPost, createPost, updatePost, deletePost, 
  likePost, bookmarkPost, incrementView 
} = require("../controllers/postController");
const { getComments, createComment } = require("../controllers/commentController");

router.get("/", optionalAuth, listPosts);
router.get("/:slug", optionalAuth, getPost);
router.post("/", authenticate, createPost);
router.post("/:id/view", optionalAuth, incrementView);
router.put("/:id", authenticate, updatePost);
router.delete("/:id", authenticate, deletePost);
router.post("/:id/like", authenticate, likePost);
router.post("/:id/bookmark", authenticate, bookmarkPost);
router.get("/:postId/comments", optionalAuth, getComments);
router.post("/:postId/comments", authenticate, createComment);

module.exports = router;
