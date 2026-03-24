const express = require("express");
const router = express.Router();
const passport = require("passport");
const { 
  register, login, refresh, getMe, googleCallback, githubCallback,
  forgotPassword, verifyOTP, resetPassword, resendOTP, verifyEmail, logout
} = require("../controllers/authController");
const { authenticate } = require("../middlewares/auth");

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);

router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", resetPassword);
router.post("/resend-otp", resendOTP);
router.post("/verify-email", verifyEmail);

// Google OAuth
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
router.get("/google/callback", passport.authenticate("google", { session: false, failureRedirect: "/" }), googleCallback);

// GitHub OAuth
router.get("/github", passport.authenticate("github", { scope: ["user:email"], session: false }));
router.get("/github/callback", passport.authenticate("github", { session: false, failureRedirect: "/" }), githubCallback);

module.exports = router;
