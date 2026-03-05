const express = require("express");
const router = express.Router();
const passport = require("passport");
const { register, login, refresh, getMe, googleCallback, githubCallback } = require("../controllers/authController");
const { authenticate } = require("../middlewares/auth");

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.get("/me", authenticate, getMe);

// Google OAuth
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
router.get("/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/" }), googleCallback);

// GitHub OAuth
router.get("/github", passport.authenticate("github", { scope: ["user:email"], session: false }));
router.get("/github/callback", passport.authenticate("github", { session: false, failureRedirect: "/" }), githubCallback);

module.exports = router;
