// routes/bookingRoutes.js
const express = require("express");
const ctrl = require("../controllers/bookingController");
const auth = require("../middlewares/auth"); // must set req.user = { _id, ... } if token is valid

const router = express.Router();

// create an available slot (owner = current user)
router.post("/slots", auth, ctrl.createSlot);

// list slots created by current user (filter by status/time window)
router.get("/my-slots", auth, ctrl.listMySlots);

// list available slots of a specific creator
router.get("/by/:userId", auth, ctrl.listByCreator);

// list my reservations (as booker)
router.get("/my-reservations", auth, ctrl.listMyReservations);

// reserve a slot
router.post("/reserve", auth, ctrl.reserve);

// cancel a slot (creator or booker can cancel)
router.post("/cancel", auth, ctrl.cancel);

module.exports = router;
