const { Category, Topic, Tag, TopicFollow, User } = require("../models");
const slugify = require("../utils/slugify");

// GET /api/topics/categories
const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.findAll({
      include: [{ model: Topic, as: "topics", attributes: ["id", "name", "slug", "postCount", "followerCount"] }],
      order: [["order", "ASC"]],
    });
    res.json({ categories });
  } catch (err) {
    next(err);
  }
};

// POST /api/topics/categories (admin)
const createCategory = async (req, res, next) => {
  try {
    const { name, description, icon, color, order } = req.body;
    const slug = slugify(name);
    const category = await Category.create({ name, slug, description, icon, color, order });
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
};

// PUT /api/topics/categories/:id (admin)
const updateCategory = async (req, res, next) => {
  try {
    const { name, description, icon, color, order } = req.body;
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const updateData = { description, icon, color, order };
    if (name && name !== category.name) {
      updateData.name = name;
      updateData.slug = slugify(name);
    }
    await category.update(updateData);
    res.json({ category });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/topics/categories/:id (admin)
const deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    await category.destroy();
    res.json({ message: "Category deleted" });
  } catch (err) {
    next(err);
  }
};

// GET /api/topics
const getTopics = async (req, res, next) => {
  try {
    const { categoryId } = req.query;
    const where = categoryId ? { categoryId } : {};
    const topics = await Topic.findAll({
      where,
      include: [{ model: Category, as: "category", attributes: ["id", "name", "slug", "color"] }],
      order: [["postCount", "DESC"]],
    });

    let followedIds = new Set();
    if (req.user) {
      const follows = await TopicFollow.findAll({ where: { userId: req.user.id }, attributes: ["topicId"] });
      followedIds = new Set(follows.map((f) => f.topicId));
    }

    res.json({ topics: topics.map((t) => ({ ...t.toJSON(), isFollowing: followedIds.has(t.id) })) });
  } catch (err) {
    next(err);
  }
};

// POST /api/topics (admin)
const createTopic = async (req, res, next) => {
  try {
    const { name, categoryId, description, icon } = req.body;
    const slug = slugify(name);
    const topic = await Topic.create({ name, slug, categoryId, description, icon });
    res.status(201).json({ topic });
  } catch (err) {
    next(err);
  }
};

// PUT /api/topics/:id (admin)
const updateTopic = async (req, res, next) => {
  try {
    const { name, categoryId, description, icon } = req.body;
    const topic = await Topic.findByPk(req.params.id);
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    const updateData = { categoryId, description, icon };
    if (name && name !== topic.name) {
      updateData.name = name;
      updateData.slug = slugify(name);
    }
    await topic.update(updateData);
    res.json({ topic });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/topics/:id (admin)
const deleteTopic = async (req, res, next) => {
  try {
    const topic = await Topic.findByPk(req.params.id);
    if (!topic) return res.status(404).json({ message: "Topic not found" });
    await topic.destroy();
    res.json({ message: "Topic deleted" });
  } catch (err) {
    next(err);
  }
};

// POST /api/topics/:id/follow
const followTopic = async (req, res, next) => {
  try {
    const topic = await Topic.findByPk(req.params.id);
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    const [, created] = await TopicFollow.findOrCreate({ where: { userId: req.user.id, topicId: topic.id } });
    if (created) {
      await topic.increment("followerCount");
      return res.json({ following: true });
    }
    await TopicFollow.destroy({ where: { userId: req.user.id, topicId: topic.id } });
    await topic.decrement("followerCount");
    res.json({ following: false });
  } catch (err) {
    next(err);
  }
};

// GET /api/tags
const getTags = async (req, res, next) => {
  try {
    const { search, page = 1, limit = 30 } = req.query;
    const { Op } = require("sequelize");
    const where = search ? { name: { [Op.like]: `%${search}%` } } : {};
    const { count, rows } = await Tag.findAndCountAll({
      where,
      order: [["postCount", "DESC"]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    res.json({ tags: rows, total: count });
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
