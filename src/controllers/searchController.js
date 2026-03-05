const { Op, literal, fn, col } = require("sequelize");
const { Post, User, Tag, Topic, SearchHistory } = require("../models");

// GET /api/search
const search = async (req, res, next) => {
  try {
    const { q, type = "all", page = 1, limit = 10 } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ message: "Query too short" });
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const results = {};
    const query = q.trim();

    if (type === "all" || type === "posts") {
      const { count, rows } = await Post.findAndCountAll({
        where: {
          status: "published",
          [Op.or]: [{ title: { [Op.like]: `%${query}%` } }, { excerpt: { [Op.like]: `%${query}%` } }],
        },
        include: [
          { model: User, as: "author", attributes: ["id", "username", "avatar"] },
          { model: Tag, as: "tags", attributes: ["id", "name", "slug", "color"], through: { attributes: [] } },
        ],
        limit: parseInt(limit),
        offset,
        order: [
          ["likeCount", "DESC"],
          ["viewCount", "DESC"],
        ],
      });
      results.posts = { items: rows, total: count };
    }

    if (type === "all" || type === "users") {
      const { count, rows } = await User.findAndCountAll({
        where: {
          [Op.or]: [{ username: { [Op.like]: `%${query}%` } }, { bio: { [Op.like]: `%${query}%` } }],
        },
        attributes: { exclude: ["password", "resetPasswordToken", "resetPasswordExpires", "googleId", "githubId"] },
        limit: parseInt(limit),
        offset,
        order: [["reputation", "DESC"]],
      });
      results.users = { items: rows, total: count };
    }

    if (type === "all" || type === "topics") {
      const { count, rows } = await Topic.findAndCountAll({
        where: {
          [Op.or]: [{ name: { [Op.like]: `%${query}%` } }, { description: { [Op.like]: `%${query}%` } }],
        },
        limit: parseInt(limit),
        offset,
      });
      results.topics = { items: rows, total: count };
    }

    // Save search history
    if (req.user) {
      await SearchHistory.create({ userId: req.user.id, query });
    }

    res.json({ query, results, page: parseInt(page) });
  } catch (err) {
    next(err);
  }
};

// GET /api/search/autocomplete
const autocomplete = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ suggestions: [] });

    const [posts, users, tags] = await Promise.all([
      Post.findAll({
        where: { status: "published", title: { [Op.like]: `%${q}%` } },
        attributes: ["id", "title", "slug"],
        limit: 5,
      }),
      User.findAll({
        where: { username: { [Op.like]: `%${q}%` } },
        attributes: ["id", "username", "avatar"],
        limit: 3,
      }),
      Tag.findAll({
        where: { name: { [Op.like]: `%${q}%` } },
        attributes: ["id", "name", "slug"],
        limit: 3,
      }),
    ]);

    res.json({
      suggestions: [
        ...posts.map((p) => ({ type: "post", id: p.id, title: p.title, slug: p.slug })),
        ...users.map((u) => ({ type: "user", id: u.id, username: u.username, avatar: u.avatar })),
        ...tags.map((t) => ({ type: "tag", id: t.id, name: t.name, slug: t.slug })),
      ],
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/search/history
const getHistory = async (req, res, next) => {
  try {
    const history = await SearchHistory.findAll({
      where: { userId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit: 10,
      attributes: ["id", "query", "createdAt"],
    });
    res.json({ history });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/search/history
const clearHistory = async (req, res, next) => {
  try {
    await SearchHistory.destroy({ where: { userId: req.user.id } });
    res.json({ message: "Search history cleared" });
  } catch (err) {
    next(err);
  }
};

module.exports = { search, autocomplete, getHistory, clearHistory };
