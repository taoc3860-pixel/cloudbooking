// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const validator = require("validator");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 32,
      match: [/^[a-zA-Z0-9_.-]+$/, "Invalid username format"],
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 64,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: (v) => !v || validator.isEmail(v),
    },
    phone: {
      type: String,
      trim: true,
      validate: (v) => !v || validator.isMobilePhone(v + "", "any"),
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    timezone: { type: String, default: "UTC" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    avatarUrl: { type: String, trim: true },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", userSchema);
