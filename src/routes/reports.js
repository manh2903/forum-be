const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth");
const { createReport } = require("../controllers/reportController");

router.post("/", authenticate, createReport);

module.exports = router;
