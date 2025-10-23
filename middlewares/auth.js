// middlewares/auth.js
const jwt = require("jsonwebtoken");

module.exports = function auth(req, res, next) {
  try {
    const header =
      req.headers.authorization || req.headers.Authorization || "";

    if (!header || !header.startsWith("Bearer ")) {
      console.warn("[Auth] Missing or invalid Authorization header:", header);
      return res
        .status(401)
        .json({ ok: false, message: "Missing or invalid Authorization header" });
    }

    const token = header.slice(7).trim();
    if (!token) {
      console.warn("[Auth] Empty Bearer token string");
      return res
        .status(401)
        .json({ ok: false, message: "Missing token after Bearer" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      uid: payload.uid || payload._id,
      _id: payload.uid || payload._id,
      username: payload.username,
      role: payload.role || "user",
    };

    next();
  } catch (err) {
    console.error("[Auth] JWT verification failed:", err.message);
    return res
      .status(401)
      .json({ ok: false, message: "Invalid or expired token" });
  }
};
