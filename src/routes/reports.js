const express = require("express");
const router = express.Router();
const { authenticate } = require("../middlewares/auth");
const { createReport, getMyReports } = require("../controllers/reportController");

router.post("/", authenticate, createReport);
router.get("/", authenticate, getMyReports);

module.exports = router;
