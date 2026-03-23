const { Comment, CommentLike, User, Post, Notification } = require("../models");
const { sequelize } = require("../config/database");
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
      subQuery: false,
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

    const processComments = (comments) => {
      return comments.map((c) => {
        const plainComment = typeof c.toJSON === "function" ? c.toJSON() : c;
        return {
          ...plainComment,
          isLiked: likedIds.has(plainComment.id),
          replies: plainComment.replies ? processComments(plainComment.replies) : [],
        };
      });
    };

    res.json({
      comments: processComments(topLevelComments.rows),
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

    const result = await sequelize.transaction(async (t) => {
      const comment = await Comment.create({ 
        content, postId, parentId, depth, authorId: req.user.id 
      }, { transaction: t });
      
      await post.increment("commentCount", { transaction: t });

      if (post.authorId !== req.user.id) {
        await User.increment("reputation", { by: 2, where: { id: post.authorId }, transaction: t });
      }

      const notifications = [];
      if (post.authorId !== req.user.id) {
        notifications.push(
          Notification.create({
            recipientId: post.authorId,
            senderId: req.user.id,
            type: "comment",
            entityType: "comment",
            entityId: comment.id,
            content: `${req.user.username} đã bình luận bài viết "${post.title}" của bạn`,
            link: `/posts/${post.slug}#comment-${comment.id}`,
            slug: post.slug,
          }, { transaction: t }),
        );
      }

      if (parentId) {
        const parent = await Comment.findByPk(parentId, { transaction: t });
        if (parent && parent.authorId !== req.user.id && parent.authorId !== post.authorId) {
          notifications.push(
            Notification.create({
              recipientId: parent.authorId,
              senderId: req.user.id,
              type: "reply",
              entityType: "comment",
              entityId: comment.id,
              content: `${req.user.username} đã phản hồi bình luận của bạn`,
              link: `/posts/${post.slug}#comment-${comment.id}`,
              slug: post.slug,
            }, { transaction: t }),
          );
        }
      }

      const mentions = extractMentions(content);
      for (const username of mentions) {
        const mentionedUser = await User.findOne({ where: { username }, transaction: t });
        if (mentionedUser && mentionedUser.id !== req.user.id) {
          notifications.push(
            Notification.create({
              recipientId: mentionedUser.id,
              senderId: req.user.id,
              type: "mention",
              entityType: "comment",
              entityId: comment.id,
              content: `${req.user.username} đã nhắc đến bạn trong một bình luận`,
              link: `/posts/${post.slug}#comment-${comment.id}`,
              slug: post.slug,
            }, { transaction: t }),
          );
        }
      }

      const createdNotifs = await Promise.all(notifications);
      return { comment, notifs: createdNotifs };
    });

    result.notifs.forEach((n) => n && sendNotification(n.recipientId, n));

    const fullComment = await Comment.findByPk(result.comment.id, {
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
    
    await sequelize.transaction(async (t) => {
      await comment.update({ isDeleted: true, content: "[Comment deleted]" }, { transaction: t });
      await Post.decrement("commentCount", { where: { id: comment.postId }, transaction: t });
      
      const post = await Post.findByPk(comment.postId, { transaction: t });
      if (post && post.authorId !== comment.authorId) {
        await User.decrement("reputation", { by: 2, where: { id: post.authorId }, transaction: t });
      }
    });

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

    const result = await sequelize.transaction(async (t) => {
      const [, created] = await CommentLike.findOrCreate({ 
        where: { userId: req.user.id, commentId: comment.id },
        transaction: t
      });
      
      if (created) {
        await comment.increment("likeCount", { transaction: t });
        await User.increment("reputation", { by: 1, where: { id: comment.authorId }, transaction: t });
        
        if (comment.authorId !== req.user.id) {
          const post = await Post.findByPk(comment.postId, { attributes: ['slug'], transaction: t });
          const notif = await Notification.create({
            recipientId: comment.authorId,
            senderId: req.user.id,
            type: "like_comment",
            entityType: "comment",
            entityId: comment.id,
            content: `${req.user.username} đã thích bình luận của bạn`,
            link: `/posts/${post?.slug || 'detail'}#comment-${comment.id}`,
            slug: post?.slug,
          }, { transaction: t });
          return { liked: true, notif };
        }
        return { liked: true };
      }

      await CommentLike.destroy({ where: { userId: req.user.id, commentId: comment.id }, transaction: t });
      await comment.decrement("likeCount", { transaction: t });
      await User.decrement("reputation", { by: 1, where: { id: comment.authorId }, transaction: t });
      return { liked: false };
    });

    if (result.notif) sendNotification(comment.authorId, result.notif);
    
    res.json({ 
      liked: result.liked, 
      likeCount: result.liked ? comment.likeCount + 1 : Math.max(0, comment.likeCount - 1) 
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getComments, createComment, updateComment, deleteComment, likeComment };
