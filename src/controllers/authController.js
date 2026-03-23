const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const passport = require("passport");
const { User, Setting } = require("../models");
const { generateTokens } = require("../middlewares/auth");
const { sendOTP } = require("../utils/email");
const crypto = require("crypto");

// Helper: Get OTP expiration minutes from settings
const getOTPExpires = async () => {
  const setting = await Setting.findOne({ where: { key: "otp_expires_minutes" } });
  const minutes = setting ? parseInt(setting.value) : 30;
  return { 
    expires: new Date(Date.now() + minutes * 60 * 1000),
    minutes 
  };
};

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { username, fullName, email, password, studentId, class: className } = req.body;
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: "Email đã tồn tại" });
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) return res.status(409).json({ message: "Username đã tồn tại" });

    if (studentId) {
      const existingStudentId = await User.findOne({ where: { studentId } });
      if (existingStudentId) return res.status(409).json({ message: "Mã sinh viên này đã được sử dụng" });
    }

    const userCount = await User.count();
    const role = userCount === 0 ? "admin" : "user";

    // Generate 6-digit OTP for verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const { expires, minutes } = await getOTPExpires();

    const user = await User.create({ 
      username, 
      fullName, 
      email, 
      password, 
      studentId, 
      class: className, 
      isVerified: role === 'admin' ? true : false, 
      role,
      otpCode: role === 'admin' ? null : otp,
      otpExpires: role === 'admin' ? null : expires
    });

    if (role !== 'admin') {
      await sendOTP(email, otp, minutes);
    }

    res.status(201).json({
      message: role === 'admin' ? "Registration successful" : "Mã OTP đã được gửi đến email để xác thực tài khoản",
      user: user.toPublicJSON(),
      requireVerification: role !== 'admin'
    });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { account, password } = req.body;
    const user = await User.findOne({
      where: {
        [Op.or]: [{ email: account }, { username: account }],
      },
    });
    if (!user || !user.password) return res.status(401).json({ message: "Thông tin đăng nhập không chính xác" });
    if (user.isBanned) return res.status(403).json({ message: "Tài khoản đã bị khóa", reason: user.banReason });
    if (!user.isVerified) return res.status(403).json({ message: "Tài khoản chưa được xác thực. Vui lòng kiểm tra email để lấy mã OTP.", email: user.email });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ message: "Thông tin đăng nhập không chính xác" });

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

// POST /api/auth/forgot-password
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "Email không tồn tại trên hệ thống" });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const { expires, minutes } = await getOTPExpires();

    await user.update({
      otpCode: otp,
      otpExpires: expires,
    });

    await sendOTP(email, otp, minutes);
    res.json({ message: "Mã OTP đã được gửi đến email của bạn" });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/verify-otp
const verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ where: { email } });
    
    if (!user || user.otpCode !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }

    // Generate temporary token for password reset
    const resetToken = jwt.sign({ id: user.id, type: 'reset' }, process.env.JWT_SECRET || 'secret', { expiresIn: '15m' });
    
    // Clear OTP after success
    await user.update({ otpCode: null, otpExpires: null });

    res.json({ message: "Xác thực thành công", resetToken });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body;
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET || 'secret');
    if (decoded.type !== 'reset') throw new Error();

    const user = await User.findByPk(decoded.id);
    if (!user) return res.status(404).json({ message: "Người dùng không tồn tại" });

    await user.update({ password: newPassword });
    res.json({ message: "Đổi mật khẩu thành công" });
  } catch (err) {
    res.status(400).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
  }
};

// POST /api/auth/resend-otp
const resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const { expires, minutes } = await getOTPExpires();

    await user.update({ otpCode: otp, otpExpires: expires });
    await sendOTP(email, otp, minutes);

    res.json({ message: "Mã OTP mới đã được gửi" });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/verify-email
const verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ where: { email } });
    
    if (!user || user.otpCode !== otp || user.otpExpires < new Date()) {
      return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }

    await user.update({ isVerified: true, otpCode: null, otpExpires: null });
    const { accessToken, refreshToken } = generateTokens(user);

    res.json({ message: "Xác thực email thành công", user: user.toPublicJSON(), accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

module.exports = { 
  register, 
  login, 
  refresh, 
  getMe, 
  googleCallback, 
  githubCallback,
  forgotPassword,
  verifyOTP,
  resetPassword,
  resendOTP,
  verifyEmail
};
