// controllers/bookingController.js
const mongoose = require("mongoose");
const Booking = require("../models/booking"); // 大小写修正：确保文件名为 Booking.js

// Create an available slot for the current user (creator).
// Body: { startTime, endTime, location?, notes? }
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

// ===== NEW: list both "mine" (created & reserved) in one call =====
exports.listMine = async (req, res) => {
  try {
    const now = new Date();

    const [created, reserved] = await Promise.all([
      Booking.find({ creator: req.user._id })
        .sort({ startTime: 1 })
        .populate("booker", "username email"),
      Booking.find({
        booker: req.user._id,
        status: "booked",
        endTime: { $gte: now },
      })
        .sort({ startTime: 1 })
        .populate("creator", "username email"),
    ]);

    return res.json({ ok: true, created, reserved });
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
};

// List slots created by current user (optional filters)
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

// List available slots of a specific creator (by userId).
exports.listByCreator = async (req, res) => {
  const { userId } = req.params;
  const { from, to } = req.query;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ ok: false, message: "Invalid userId" });
  }

  const q = { creator: userId, status: "available" };
  if (from || to) {
    q.startTime = {};
    if (from) q.startTime.$gte = new Date(from);
    if (to) q.startTime.$lte = new Date(to);
  }

  const items = await Booking.find(q).sort({ startTime: 1 });
  res.json({ ok: true, items });
};

// List my reservations as a booker (future first).
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

// Reserve a slot
exports.reserve = async (req, res) => {
  try {
    const { slotId } = req.body;
    if (!slotId) return res.status(400).json({ ok: false, message: "slotId is required" });
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ ok: false, message: "Invalid slotId" });
    }

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

// ===== Tightened: Cancel a slot (CREATOR ONLY) =====
// 现在只允许创建者取消（状态置为 cancelled），booker 不能用此接口取消。
exports.cancel = async (req, res) => {
  try {
    const { slotId } = req.body;
    if (!slotId) return res.status(400).json({ ok: false, message: "slotId is required" });
    if (!mongoose.Types.ObjectId.isValid(slotId)) {
      return res.status(400).json({ ok: false, message: "Invalid slotId" });
    }

    const slot = await Booking.findById(slotId);
    if (!slot) return res.status(404).json({ ok: false, message: "Slot not found" });

    const isCreator = slot.creator.toString() === req.user._id.toString();
    if (!isCreator) {
      return res.status(403).json({ ok: false, message: "Only creator can cancel this slot" });
    }

    const updated = await Booking.cancel({ slotId });
    res.json({ ok: true, booking: updated });
  } catch (e) {
    res.status(400).json({ ok: false, message: e.message });
  }
};

// ===== NEW: Hard delete a slot (CREATOR ONLY) =====
// 仅允许创建者删除；若已被预订，建议阻止硬删（避免误删用户预约）
exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "Invalid booking id" });
    }
    const slot = await Booking.findById(id);
    if (!slot) return res.status(404).json({ ok: false, message: "Booking not found" });

    const isCreator = slot.creator.toString() === req.user._id.toString();
    if (!isCreator) {
      return res.status(403).json({ ok: false, message: "Only creator can delete this booking" });
    }

    // 若不想允许删除已预订的时段，可加下面一行保护
    if (slot.status === "booked") {
      return res.status(409).json({ ok: false, message: "Cannot delete a booked slot" });
    }

    await slot.deleteOne();
    return res.json({ ok: true, deleted: id });
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
};
