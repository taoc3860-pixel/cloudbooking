// routes/auth.js
const express = require("express");
const router = express.Router();
const authCtrl = require("../controllers/authController");
const auth = require("../middlewares/auth");

// 这些路由必须是“公开”的（不走 auth 中间件）
router.post("/register", authCtrl.register);
router.post("/login", authCtrl.login);

// 受保护路由示例
router.get("/me", auth, authCtrl.me);

module.exports = router;
