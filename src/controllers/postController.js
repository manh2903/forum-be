const { Op, literal } = require("sequelize");
const slugify = require("../utils/slugify");
const { Post, PostLike, Bookmark, PostTag, Tag, User, Topic, Comment, Notification } = require("../models");
const { sendNotification } = require("../socket");

// GET /api/posts
const listPosts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, topic, tag, search, sort = "latest", status = "published", bookmarked } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { status };

    if (topic) where.topicId = topic;
    if (search) {
      where[Op.or] = [{ title: { [Op.like]: `%${search}%` } }, { excerpt: { [Op.like]: `%${search}%` } }];
    }

    const include = [
      { model: User, as: "author", attributes: ["id", "username", "avatar", "reputation", "role"] },
      { model: Topic, as: "topic", attributes: ["id", "name", "slug"] },
      {
        model: Tag,
        as: "tags",
        attributes: ["id", "name", "slug", "color"],
        through: { attributes: [] },
        ...(tag ? { where: { slug: tag }, required: true } : { required: false }),
      },
    ];

    if (bookmarked === "true" && req.user) {
      include.push({
        model: Bookmark,
        as: "bookmarks",
        where: { userId: req.user.id },
        attributes: [],
        required: true,
      });
    }

    const orderMap = {
      latest: [["createdAt", "DESC"]],
      oldest: [["createdAt", "ASC"]],
      popular: [
        ["likeCount", "DESC"],
        ["viewCount", "DESC"],
      ],
      trending: [["viewCount", "DESC"]],
    };
    const order = orderMap[sort] || orderMap.latest;

    const { count, rows } = await Post.findAndCountAll({
      where,
      include,
      order,
      limit: parseInt(limit),
      offset,
      distinct: true,
    });

    // Add user-specific flags
    let likedIds = new Set(),
      bookmarkedIds = new Set();
    if (req.user) {
      const [likes, bookmarks] = await Promise.all([
        PostLike.findAll({ where: { userId: req.user.id, postId: rows.map((p) => p.id) }, attributes: ["postId"] }),
        Bookmark.findAll({ where: { userId: req.user.id, postId: rows.map((p) => p.id) }, attributes: ["postId"] }),
      ]);
      likedIds = new Set(likes.map((l) => l.postId));
      bookmarkedIds = new Set(bookmarks.map((b) => b.postId));
    }

    const posts = rows.map((post) => ({
      ...post.toJSON(),
      isLiked: likedIds.has(post.id),
      isBookmarked: bookmarkedIds.has(post.id),
    }));

    res.json({ posts, total: count, page: parseInt(page), totalPages: Math.ceil(count / parseInt(limit)) });
  } catch (err) {
    next(err);
  }
};

// GET /api/posts/:slug
const getPost = async (req, res, next) => {
  try {
    const isId = !isNaN(req.params.slug) && Number.isInteger(parseFloat(req.params.slug));
    const whereClause = isId ? { id: parseInt(req.params.slug) } : { slug: req.params.slug };

    const post = await Post.findOne({
      where: whereClause,
      include: [
        { model: User, as: "author", attributes: ["id", "username", "avatar", "bio", "reputation", "role"] },
        { model: Topic, as: "topic", attributes: ["id", "name", "slug"] },
        { model: Tag, as: "tags", attributes: ["id", "name", "slug", "color"], through: { attributes: [] } },
      ],
    });
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Check permissions for unpublished posts
    if (post.status !== "published") {
      if (!req.user || (req.user.id !== post.authorId && req.user.role === "user")) {
        return res.status(404).json({ message: "Post not found" });
      }
    } else {
      // Increment view count
      await post.increment("viewCount");
      post.viewCount += 1;
    }

    let isLiked = false,
      isBookmarked = false;
    if (req.user) {
      [isLiked, isBookmarked] = await Promise.all([
        PostLike.findOne({ where: { userId: req.user.id, postId: post.id } }),
        Bookmark.findOne({ where: { userId: req.user.id, postId: post.id } }),
      ]);
    }

    res.json({ post: { ...post.toJSON(), isLiked: !!isLiked, isBookmarked: !!isBookmarked } });
  } catch (err) {
    next(err);
  }
};

// POST /api/posts
const createPost = async (req, res, next) => {
  try {
    const { title, content, excerpt, topicId, tags = [], status = "draft", coverImage } = req.body;
    const slug = await generateUniqueSlug(title);
    const readTime = Math.ceil(content.split(" ").length / 200);

    let finalStatus = status;
    if (finalStatus === "published" && req.user.role === "user") {
      finalStatus = "pending";
    }

    const post = await Post.create({
      title,
      content,
      excerpt:
        excerpt ||
        content
          .replace(/<[^>]*>?/gm, "")
          .replace(/&nbsp;/g, " ")
          .substring(0, 200),
      slug,
      topicId: topicId || null,
      status: finalStatus,
      coverImage,
      readTime,
      authorId: req.user.id,
      publishedAt: finalStatus === "published" ? new Date() : null,
    });

    // Handle tags
    if (tags.length > 0) {
      await handleTags(post.id, tags);
    }

    // Update topic post count
    if (topicId) await Topic.increment("postCount", { where: { id: topicId } });

    // Reputation: +5 khi đăng bài published
    if (status === "published") {
      await User.increment("reputation", { by: 5, where: { id: req.user.id } });
    }

    const fullPost = await Post.findByPk(post.id, {
      include: [
        { model: User, as: "author", attributes: ["id", "username", "avatar"] },
        { model: Tag, as: "tags", attributes: ["id", "name", "slug", "color"], through: { attributes: [] } },
        { model: Topic, as: "topic", attributes: ["id", "name", "slug"] },
      ],
    });
    res.status(201).json({ post: fullPost });
  } catch (err) {
    next(err);
  }
};

// PUT /api/posts/:id
const updatePost = async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.authorId !== req.user.id && req.user.role === "user") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { title, content, excerpt, topicId, tags, status, coverImage } = req.body;
    
    let finalStatus = status;
    if (finalStatus === "published" && req.user.role === "user") {
      finalStatus = "pending";
    }

    const updateData = { title, content, excerpt, topicId: topicId || null, status: finalStatus, coverImage };
    if (finalStatus === "published" && !post.publishedAt) {
      updateData.publishedAt = new Date();
      // Reputation: +5 khi chuyển sang published lần đầu
      await User.increment("reputation", { by: 5, where: { id: post.authorId } });
    }
    if (content) updateData.readTime = Math.ceil(content.split(" ").length / 200);

    await post.update(updateData);
    if (tags) await handleTags(post.id, tags);

    const fullPost = await Post.findByPk(post.id, {
      include: [
        { model: User, as: "author", attributes: ["id", "username", "avatar"] },
        { model: Tag, as: "tags", attributes: ["id", "name", "slug", "color"], through: { attributes: [] } },
        { model: Topic, as: "topic", attributes: ["id", "name", "slug"] },
      ],
    });
    res.json({ post: fullPost });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/posts/:id
const deletePost = async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.authorId !== req.user.id && req.user.role === "user") {
      return res.status(403).json({ message: "Forbidden" });
    }
    await post.update({ isDeleted: true });
    // Reputation: -5 khi xóa bài published
    if (post.status === "published") {
      await User.decrement("reputation", { by: 5, where: { id: post.authorId } });
    }
    res.json({ message: "Post deleted" });
  } catch (err) {
    next(err);
  }
};

// POST /api/posts/:id/like
const likePost = async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const [, created] = await PostLike.findOrCreate({ where: { userId: req.user.id, postId: post.id } });
    if (created) {
      await post.increment("likeCount");
      // Reputation: +2 khi bài được like
      await User.increment("reputation", { by: 2, where: { id: post.authorId } });
      if (post.authorId !== req.user.id) {
        const notif = await Notification.create({
          recipientId: post.authorId,
          senderId: req.user.id,
          type: "like_post",
          entityType: "post",
          entityId: post.id,
          content: `${req.user.username} liked your post "${post.title}"`,
          link: `/posts/${post.slug}`,
        });
        sendNotification(post.authorId, notif);
      }
      return res.json({ liked: true, likeCount: post.likeCount + 1 });
    }
    // Unlike: -2 điểm (hoàn trả)
    await PostLike.destroy({ where: { userId: req.user.id, postId: post.id } });
    await post.decrement("likeCount");
    await User.decrement("reputation", { by: 2, where: { id: post.authorId } });
    res.json({ liked: false, likeCount: Math.max(0, post.likeCount - 1) });
  } catch (err) {
    next(err);
  }
};

// POST /api/posts/:id/bookmark
const bookmarkPost = async (req, res, next) => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    const [, created] = await Bookmark.findOrCreate({ where: { userId: req.user.id, postId: post.id } });
    if (created) {
      await post.increment("bookmarkCount");
      // Reputation: +1 khi bài được bookmark
      await User.increment("reputation", { by: 1, where: { id: post.authorId } });
      return res.json({ bookmarked: true });
    }
    // Un-bookmark: -1 điểm (hoàn trả)
    await Bookmark.destroy({ where: { userId: req.user.id, postId: post.id } });
    await post.decrement("bookmarkCount");
    await User.decrement("reputation", { by: 1, where: { id: post.authorId } });
    res.json({ bookmarked: false });
  } catch (err) {
    next(err);
  }
};

// Helper: generate unique slug
async function generateUniqueSlug(title, excludeId = null) {
  let slug = slugify(title);
  let count = 0;
  while (true) {
    const candidate = count === 0 ? slug : `${slug}-${count}`;
    const where = { slug: candidate };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const existing = await Post.findOne({ where });
    if (!existing) return candidate;
    count++;
  }
}

// Helper: handle tags (create if not exist, link to post)
async function handleTags(postId, tagNames) {
  await PostTag.destroy({ where: { postId } });
  const tagIds = [];
  for (const name of tagNames) {
    const slug = slugify(name);
    const [tag, created] = await Tag.findOrCreate({ where: { slug }, defaults: { name, slug } });
    tagIds.push(tag.id);
  }
  await Promise.all(tagIds.map((tagId) => PostTag.findOrCreate({ where: { postId, tagId } })));
  // Update tag post counts
  await Promise.all(tagIds.map((tagId) => Tag.update({ postCount: literal("postCount + 1") }, { where: { id: tagId } })));
}

module.exports = { listPosts, getPost, createPost, updatePost, deletePost, likePost, bookmarkPost };
