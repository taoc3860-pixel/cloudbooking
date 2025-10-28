// routes/bookingRoutes.js
const router = require("express").Router();
const auth = require("../middlewares/auth");
const ctrl = require("../controllers/bookingController");

// Protect all booking endpoints to ensure req.user exists
router.use(auth);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.detail);
router.post("/:id/join", ctrl.join);
router.post("/:id/leave", ctrl.leave);
router.delete("/:id", ctrl.remove);

module.exports = router;
