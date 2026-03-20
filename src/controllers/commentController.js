const { Comment, CommentLike, User, Post, Notification } = require("../models");
const { sendNotification } = require("../socket");

const extractMentions = (content) => {
  const mentions = content.match(/@(\w+)/g) || [];
  return [...new Set(mentions.map((m) => m.slice(1)))];
};

// GET /api/posts/:postId/comments
const getComments = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const topLevelComments = await Comment.findAndCountAll({
      where: { postId, parentId: null },
      include: [
        { model: User, as: "author", attributes: ["id", "username", "avatar", "reputation", "role"] },
        {
          model: Comment,
          as: "replies",
          required: false,
          include: [
            { model: User, as: "author", attributes: ["id", "username", "avatar", "reputation", "role"] },
            {
              model: Comment,
              as: "replies",
              required: false,
              include: [{ model: User, as: "author", attributes: ["id", "username", "avatar", "reputation", "role"] }],
            },
          ],
        },
      ],
      order: [
        ["createdAt", "ASC"],
        [{ model: Comment, as: "replies" }, "createdAt", "ASC"],
      ],
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    let likedIds = new Set();
    if (req.user) {
      const getAllIds = (comments) => {
        const ids = [];
        for (const c of comments) {
          ids.push(c.id);
          if (c.replies) ids.push(...getAllIds(c.replies));
        }
        return ids;
      };
      const allIds = getAllIds(topLevelComments.rows);
      const likes = await CommentLike.findAll({ where: { userId: req.user.id, commentId: allIds }, attributes: ["commentId"] });
      likedIds = new Set(likes.map((l) => l.commentId));
    }

    const addIsLiked = (comments) =>
      comments.map((c) => ({
        ...c.toJSON(),
        isLiked: likedIds.has(c.id),
        replies: c.replies ? addIsLiked(c.replies) : [],
      }));

    res.json({
      comments: addIsLiked(topLevelComments.rows),
      total: topLevelComments.count,
      page: parseInt(page),
      totalPages: Math.ceil(topLevelComments.count / parseInt(limit)),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/posts/:postId/comments
const createComment = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body;

    const post = await Post.findByPk(postId);
    if (!post) return res.status(404).json({ message: "Post not found" });

    let depth = 0;
    if (parentId) {
      const parent = await Comment.findByPk(parentId);
      if (!parent) return res.status(404).json({ message: "Parent comment not found" });
      if (parent.depth >= 2) return res.status(400).json({ message: "Maximum nesting depth (3) exceeded" });
      depth = parent.depth + 1;
    }

    const comment = await Comment.create({ content, postId, parentId, depth, authorId: req.user.id });
    await post.increment("commentCount");

    // Reputation: +2 cho tác giả bài viết khi nhận comment (không được tự comment bài mình)
    if (post.authorId !== req.user.id) {
      await User.increment("reputation", { by: 2, where: { id: post.authorId } });
    }

    // Notifications
    const notifications = [];
    if (post.authorId !== req.user.id) {
      notifications.push(
        Notification.create({
          recipientId: post.authorId,
          senderId: req.user.id,
          type: parentId ? "comment" : "comment",
          entityType: "comment",
          entityId: comment.id,
          content: `${req.user.username} commented on your post "${post.title}"`,
          link: `/posts/${post.slug}#comment-${comment.id}`,
        }),
      );
    }

    // Notify parent comment author
    if (parentId) {
      const parent = await Comment.findByPk(parentId);
      if (parent && parent.authorId !== req.user.id && parent.authorId !== post.authorId) {
        notifications.push(
          Notification.create({
            recipientId: parent.authorId,
            senderId: req.user.id,
            type: "reply",
            entityType: "comment",
            entityId: comment.id,
            content: `${req.user.username} replied to your comment`,
            link: `/posts/${post.slug}#comment-${comment.id}`,
          }),
        );
      }
    }

    // Handle @mentions
    const mentions = extractMentions(content);
    for (const username of mentions) {
      const mentionedUser = await User.findOne({ where: { username } });
      if (mentionedUser && mentionedUser.id !== req.user.id) {
        notifications.push(
          Notification.create({
            recipientId: mentionedUser.id,
            senderId: req.user.id,
            type: "mention",
            entityType: "comment",
            entityId: comment.id,
            content: `${req.user.username} mentioned you in a comment`,
            link: `/posts/${post.slug}#comment-${comment.id}`,
          }),
        );
      }
    }

    const notifs = await Promise.all(notifications);
    notifs.forEach((n) => n && sendNotification(n.recipientId, n));

    const fullComment = await Comment.findByPk(comment.id, {
      include: [{ model: User, as: "author", attributes: ["id", "username", "avatar", "reputation", "role"] }],
    });
    res.status(201).json({ comment: { ...fullComment.toJSON(), isLiked: false, replies: [] } });
  } catch (err) {
    next(err);
  }
};

// PUT /api/comments/:id
const updateComment = async (req, res, next) => {
  try {
    const comment = await Comment.findByPk(req.params.id);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    if (comment.authorId !== req.user.id) return res.status(403).json({ message: "Forbidden" });
    await comment.update({ content: req.body.content });
    res.json({ comment });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/comments/:id
const deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findByPk(req.params.id);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    if (comment.authorId !== req.user.id && req.user.role === "user") return res.status(403).json({ message: "Forbidden" });
    await comment.update({ isDeleted: true, content: "[Comment deleted]" });
    await Post.decrement("commentCount", { where: { id: comment.postId } });
    // Reputation: -2 khi comment bị xóa (hoàn trả)
    const post = await Post.findByPk(comment.postId);
    if (post && post.authorId !== comment.authorId) {
      await User.decrement("reputation", { by: 2, where: { id: post.authorId } });
    }
    res.json({ message: "Comment deleted" });
  } catch (err) {
    next(err);
  }
};

// POST /api/comments/:id/like
const likeComment = async (req, res, next) => {
  try {
    const comment = await Comment.findByPk(req.params.id);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const [, created] = await CommentLike.findOrCreate({ where: { userId: req.user.id, commentId: comment.id } });
    if (created) {
      await comment.increment("likeCount");
      // Reputation: +1 khi comment được like
      await User.increment("reputation", { by: 1, where: { id: comment.authorId } });
      if (comment.authorId !== req.user.id) {
        const notif = await Notification.create({
          recipientId: comment.authorId,
          senderId: req.user.id,
          type: "like_comment",
          entityType: "comment",
          entityId: comment.id,
          content: `${req.user.username} liked your comment`,
        });
        sendNotification(comment.authorId, notif);
      }
      return res.json({ liked: true, likeCount: comment.likeCount + 1 });
    }
    // Unlike comment: -1 điểm (hoàn trả)
    await CommentLike.destroy({ where: { userId: req.user.id, commentId: comment.id } });
    await comment.decrement("likeCount");
    await User.decrement("reputation", { by: 1, where: { id: comment.authorId } });
    res.json({ liked: false, likeCount: Math.max(0, comment.likeCount - 1) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getComments, createComment, updateComment, deleteComment, likeComment };
