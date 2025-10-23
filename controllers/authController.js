// controllers/authController.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User"); 

function signToken(user) {
  return jwt.sign(
    { uid: user._id.toString(), username: user.username, role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// 注册
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ ok: false, message: "username & password required" });

    const existing = await User.findOne({ username });
    if (existing)
      return res.status(409).json({ ok: false, message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username,
      password: hashed,
      role: "user",
    });

    const token = signToken(newUser);
    return res.status(201).json({
      ok: true,
      token,
      uid: newUser._id,
      username: newUser.username,
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ ok: false, message: "username & password required" });

    const user = await User.findOne({ username });
    if (!user)
      return res.status(401).json({ ok: false, message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ ok: false, message: "Invalid credentials" });

    const token = signToken(user);
    return res.json({
      ok: true,
      token,
      uid: user._id,
      username: user.username,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.uid).select("-password");
    if (!user)
      return res.status(404).json({ ok: false, message: "User not found" });
    return res.json({
      ok: true,
      uid: user._id,
      username: user.username,
      role: user.role || "user",
    });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};
