const { Setting } = require("../models");

// GET /api/settings/:key
const getSettingByKey = async (req, res, next) => {
  try {
    const setting = await Setting.findOne({ where: { key: req.params.key } });
    if (!setting) return res.status(404).json({ message: "Setting not found" });
    res.json({ setting });
  } catch (err) {
    next(err);
  }
};

// GET /api/settings (Admin only to list all)
const getAllSettings = async (req, res, next) => {
  try {
    const settings = await Setting.findAll({ order: [['key', 'ASC']] });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
};

// PUT /api/settings/:key (Admin only)
const updateSetting = async (req, res, next) => {
  try {
    const { value, description } = req.body;
    const { key } = req.params;

    let setting = await Setting.findOne({ where: { key } });
    if (setting) {
      await setting.update({ value, description });
    } else {
      setting = await Setting.create({ key, value, description });
    }

    res.json({ message: "Setting updated successfully", setting });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSettingByKey,
  getAllSettings,
  updateSetting,
};
