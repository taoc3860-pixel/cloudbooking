// routes/bookingRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const booking = require("../controllers/bookingController");

// /api/bookings
router.get("/", auth, booking.list);           // ?mine=1
router.post("/", auth, booking.create);

// /api/bookings/:id
router.get("/:id", auth, booking.detail);
router.post("/:id/join", auth, booking.join);  // 将“加入”视为预定（booker）
router.post("/:id/leave", auth, booking.leave);// 取消预定（仅 booker/creator）
router.delete("/:id", auth, booking.remove);   // 仅 creator 可删

module.exports = router;
