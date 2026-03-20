const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");
const bcrypt = require("bcryptjs");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    fullName: { type: DataTypes.STRING(255), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    studentId: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    class: { type: DataTypes.STRING(50), allowNull: true },
    password: { type: DataTypes.STRING(255), allowNull: true },
    avatar: { type: DataTypes.STRING(500), defaultValue: null },
    bio: { type: DataTypes.TEXT, defaultValue: null },
    role: { type: DataTypes.ENUM("user", "moderator", "admin"), defaultValue: "user" },
    reputation: { type: DataTypes.INTEGER, defaultValue: 0 },
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
    isBanned: { type: DataTypes.BOOLEAN, defaultValue: false },
    banReason: { type: DataTypes.TEXT, defaultValue: null },
    googleId: { type: DataTypes.STRING(255), defaultValue: null },
    githubId: { type: DataTypes.STRING(255), defaultValue: null },
    website: { type: DataTypes.STRING(500), defaultValue: null },
    location: { type: DataTypes.STRING(255), defaultValue: null },
    jobTitle: { type: DataTypes.STRING(255), defaultValue: null },
    githubUrl: { type: DataTypes.STRING(500), defaultValue: null },
    twitterUrl: { type: DataTypes.STRING(500), defaultValue: null },
    emailNotifications: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastLogin: { type: DataTypes.DATE, defaultValue: null },
    resetPasswordToken: { type: DataTypes.STRING(255), defaultValue: null },
    resetPasswordExpires: { type: DataTypes.DATE, defaultValue: null },
  },
  {
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) user.password = await bcrypt.hash(user.password, 12);
      },
      beforeUpdate: async (user) => {
        if (user.changed("password") && user.password) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
    },
  },
);

User.prototype.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

User.prototype.toPublicJSON = function () {
  const { password, resetPasswordToken, resetPasswordExpires, googleId, githubId, ...rest } = this.toJSON();
  return { ...rest, hasPassword: !!password };
};

module.exports = User;
