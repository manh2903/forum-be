const { Banner } = require("../models");

// GET /api/banners
const listBanners = async (req, res, next) => {
  try {
    const { position = "home_top" } = req.query;
    const banners = await Banner.findAll({
      where: { isActive: true, position },
      order: [
        ["order", "ASC"],
        ["createdAt", "DESC"],
      ],
    });
    res.json({ banners });
  } catch (err) {
    next(err);
  }
};

// GET /api/banners/admin
const adminListBanners = async (req, res, next) => {
  try {
    const banners = await Banner.findAll({
      order: [
        ["isActive", "DESC"],
        ["order", "ASC"],
        ["createdAt", "DESC"],
      ],
    });
    res.json({ banners });
  } catch (err) {
    next(err);
  }
};

// POST /api/banners
const createBanner = async (req, res, next) => {
  try {
    const { title, imageUrl, link, order, isActive, position } = req.body;
    const banner = await Banner.create({
      title,
      imageUrl,
      link,
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true,
      position: position || "home_top",
    });
    res.status(201).json({ banner });
  } catch (err) {
    next(err);
  }
};

// PUT /api/banners/:id
const updateBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findByPk(req.params.id);
    if (!banner) return res.status(404).json({ message: "Banner not found" });

    const { title, imageUrl, link, order, isActive, position } = req.body;
    await banner.update({ title, imageUrl, link, order, isActive, position });
    res.json({ banner });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/banners/:id
const deleteBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findByPk(req.params.id);
    if (!banner) return res.status(404).json({ message: "Banner not found" });

    await banner.update({ isDeleted: true });
    res.json({ message: "Banner deleted" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listBanners,
  adminListBanners,
  createBanner,
  updateBanner,
  deleteBanner,
};
