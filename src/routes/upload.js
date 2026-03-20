const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { authenticate } = require("../middlewares/auth");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require("fs");
    const type = req.query.type || "others";
    const dir = `uploads/${type}/`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only images are allowed"));
  },
});

router.post("/image", authenticate, upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  const type = req.query.type || "others";
  res.json({ url: `/uploads/${type}/${req.file.filename}`, filename: req.file.filename });
});

module.exports = router;
