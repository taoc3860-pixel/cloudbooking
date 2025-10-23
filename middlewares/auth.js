// middlewares/auth.js
const jwt = require("jsonwebtoken");

module.exports = function auth(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, message: "Missing or invalid Authorization header" });
  }
  const token = header.slice(7).trim();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      uid: payload.uid || payload._id,
      _id: payload.uid || payload._id,
      username: payload.username,
      role: payload.role || "user",
    };
    return next();
  } catch (err) {
    console.error("[Auth] JWT verify failed:", err.message);
    return res.status(401).json({ ok: false, message: "Invalid or expired token" });
  }
};
