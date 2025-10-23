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

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "username & password required" });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ ok: false, message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = await User.create({ username, password: hashed, role: "user" });

    const token = signToken(newUser);
    return res.status(201).json({
      ok: true,
      token,
      user: { id: newUser._id, username: newUser.username, role: newUser.role },
    });
  } catch (err) {
    console.error("[Auth][register] error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "username & password required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    const token = signToken(user);
    return res.status(200).json({
      ok: true,
      token,
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error("[Auth][login] error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};

exports.me = async (req, res) => {
  const u = req.user;
  return res.json({ ok: true, user: { id: u._id, username: u.username, role: u.role } });
};
