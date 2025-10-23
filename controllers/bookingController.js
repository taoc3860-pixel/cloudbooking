// controllers/bookingController.js
const mongoose = require("mongoose");
const Booking = require("../models/booking");

//Create an available slot for the current user (creator).Body: { startTime, endTime, location?, notes? }
exports.createSlot = async (req, res) => {
  try {
    const { startTime, endTime, location, notes } = req.body;
    if (!startTime || !endTime) {
      return res.status(400).json({ ok: false, message: "startTime and endTime are required" });
    }
    const slot = await Booking.createSlot({
      creator: req.user._id,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      location,
      notes,
    });
    res.json({ ok: true, slot });
  } catch (e) {
    res.status(e.code === "TIME_CONFLICT" ? 409 : 400).json({ ok: false, message: e.message });
  }
};

//List slots created by current user. Query:?status=available|booked|cancelled&from=ISO&to=ISO
exports.listMySlots = async (req, res) => {
  const creator = req.user._id;
  const { status, from, to } = req.query;

  const q = { creator };
  if (status) q.status = status;
  if (from || to) {
    q.startTime = {};
    if (from) q.startTime.$gte = new Date(from);
    if (to) q.startTime.$lte = new Date(to);
  }

  const items = await Booking.find(q).sort({ startTime: 1 }).populate("booker", "username email");
  res.json({ ok: true, items });
};

//List available slots of a specific creator (by userId). Route: GET /api/bookings/by/:userId?from=ISO&to=ISO/
exports.listByCreator = async (req, res) => {
  const { userId } = req.params;
  const { from, to } = req.query;

  const q = { creator: userId, status: "available" };
  if (from || to) {
    q.startTime = {};
    if (from) q.startTime.$gte = new Date(from);
    if (to) q.startTime.$lte = new Date(to);
  }

  const items = await Booking.find(q).sort({ startTime: 1 });
  res.json({ ok: true, items });
};

//List my reservations as a booker (future first). Route: GET /api/bookings/my-reservations/
exports.listMyReservations = async (req, res) => {
  const now = new Date();
  const items = await Booking.find({
    booker: req.user._id,
    status: "booked",
    endTime: { $gte: now },
  })
    .sort({ startTime: 1 })
    .populate("creator", "username email");
  res.json({ ok: true, items });
};

//Reserve a slot (only if it's still available). Body: { slotId }
exports.reserve = async (req, res) => {
  try {
    const { slotId } = req.body;
    if (!slotId) return res.status(400).json({ ok: false, message: "slotId is required" });

    // prevent creator booking their own slot (optional rule)
    const slot = await Booking.findById(slotId);
    if (!slot) return res.status(404).json({ ok: false, message: "Slot not found" });
    if (slot.creator.toString() === req.user._id.toString()) {
      return res.status(400).json({ ok: false, message: "Creator cannot reserve own slot" });
    }

    const updated = await Booking.reserve({ slotId, bookerId: req.user._id });
    if (!updated) return res.status(409).json({ ok: false, message: "Already booked or unavailable" });

    const populated = await updated.populate("creator", "username email");
    res.json({ ok: true, booking: populated });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
};

//Cancel a slot (creator or booker can cancel).Body: { slotId }
exports.cancel = async (req, res) => {
  try {
    const { slotId } = req.body;
    if (!slotId) return res.status(400).json({ ok: false, message: "slotId is required" });

    const slot = await Booking.findById(slotId);
    if (!slot) return res.status(404).json({ ok: false, message: "Slot not found" });

    const isCreator = slot.creator.toString() === req.user._id.toString();
    const isBooker = slot.booker && slot.booker.toString() === req.user._id.toString();
    if (!isCreator && !isBooker) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    const updated = await Booking.cancel({ slotId });
    res.json({ ok: true, booking: updated });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
};
