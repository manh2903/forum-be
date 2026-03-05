const express = require("express");
const router = express.Router();
const { optionalAuth, authenticate } = require("../middlewares/auth");
const { search, autocomplete, getHistory, clearHistory } = require("../controllers/searchController");

router.get("/", optionalAuth, search);
router.get("/autocomplete", autocomplete);
router.get("/history", authenticate, getHistory);
router.delete("/history", authenticate, clearHistory);

module.exports = router;
