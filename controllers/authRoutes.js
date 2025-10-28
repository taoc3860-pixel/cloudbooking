// routes/authRoutes.js
const express = require("express");
const { register, login, me } = require("../controllers/authController");
const auth = require("../middlewares/auth"); // JWT 校验中间件

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", auth, me);

module.exports = router;
