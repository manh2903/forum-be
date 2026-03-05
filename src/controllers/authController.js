const jwt = require("jsonwebtoken");
const passport = require("passport");
const { User } = require("../models");
const { generateTokens } = require("../middlewares/auth");

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: "Email already in use" });
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) return res.status(409).json({ message: "Username already taken" });

    const userCount = await User.count();
    const role = userCount === 0 ? "admin" : "user";

    const user = await User.create({ username, email, password, isVerified: true, role });
    const { accessToken, refreshToken } = generateTokens(user);
    res.status(201).json({
      message: "Registration successful",
      user: user.toPublicJSON(),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user || !user.password) return res.status(401).json({ message: "Invalid credentials" });
    if (user.isBanned) return res.status(403).json({ message: "Account banned", reason: user.banReason });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    await user.update({ lastLogin: new Date() });
    const { accessToken, refreshToken } = generateTokens(user);
    res.json({ user: user.toPublicJSON(), accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/refresh
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token required" });
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findByPk(decoded.id);
    if (!user || user.isBanned) return res.status(401).json({ message: "Invalid token" });
    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    next(err);
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ user: req.user.toPublicJSON() });
};

// Google OAuth callback
const googleCallback = (req, res) => {
  const { accessToken, refreshToken } = generateTokens(req.user);
  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
  res.redirect(`${clientUrl}/auth/callback?token=${accessToken}&refresh=${refreshToken}`);
};

// GitHub OAuth callback
const githubCallback = (req, res) => {
  const { accessToken, refreshToken } = generateTokens(req.user);
  const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
  res.redirect(`${clientUrl}/auth/callback?token=${accessToken}&refresh=${refreshToken}`);
};

module.exports = { register, login, refresh, getMe, googleCallback, githubCallback };
