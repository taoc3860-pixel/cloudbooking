const router = require("express").Router();
const authCtrl = require("../controllers/authController");
const auth = require("../middlewares/auth");

// Health check for auth router
router.get("/health", (_req, res) => res.json({ ok: true, scope: "auth" }));

// Public
router.post("/register", authCtrl.register);
router.post("/login", authCtrl.login);

// Protected
router.get("/me", auth, authCtrl.me);

module.exports = router;
