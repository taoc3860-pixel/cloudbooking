// routes/authRoutes.js
const router = require("express").Router();
const authCtrl = require("../controllers/authController");
const auth = require("../middlewares/auth");

// Public
router.post("/register", authCtrl.register);
router.post("/login", authCtrl.login);

// Protected
router.get("/me", auth, authCtrl.me);

module.exports = router;
