// controllers/bookingController.js
// IMPORTANT on Linux: filename is Booking.js (uppercase B)
const Booking = require("../models/booking");

// Room list (keep in sync with frontend)
const rooms = [
  { id: "r1", name: "Room A", capacity: 6,  location: "1F", tags: ["projector"] },
  { id: "r2", name: "Room B", capacity: 10, location: "2F", tags: ["whiteboard"] },
  { id: "r3", name: "Room C", capacity: 8,  location: "3F", tags: ["conference"] },
];

function parseUserId(req) {
  // token payload may be in req.user / req.user.id / req.user._id / req.user.uid
  return req.user?.id || req.user?._id || req.user?.uid;
}

function toDateLocal(dateStr, hhmm) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const [hh, mm] = String(hhmm).split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fmtHM(d)   { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

// map db doc to client booking object
function asClient(b) {
  const start = new Date(b.startTime);
  const end   = new Date(b.endTime);
  const room = rooms.find(r => r.id === b.roomId);
  return {
    id: String(b._id),
    uid: String(b.creator),
    roomId: b.roomId || "r1",
    roomName: room ? room.name : (b.location || "Room"),
    date: fmtDate(start),
    start: fmtHM(start),
    end: fmtHM(end),
    notes: b.notes || "",
    status: b.status === "booked" ? "confirmed" :
            b.status === "cancelled" ? "cancelled" : "available",
    participants: [
      String(b.creator),
      ...(b.booker ? [String(b.booker)] : [])
    ]
  };
}

// GET /api/bookings (?mine=1)
exports.list = async (req, res) => {
  try {
    const userId = parseUserId(req);
    const mine = req.query.mine === "1";
    const filter = mine ? { $or: [{ creator: userId }, { booker: userId }] } : {};
    const docs = await Booking.find(filter).sort({ startTime: 1 }).lean();
    res.json(docs.map(asClient));
  } catch (e) {
    console.error("[Booking][list] error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// POST /api/bookings
// body: { roomId, date:"YYYY-MM-DD", start:"HH:MM", end:"HH:MM", notes }
exports.create = async (req, res) => {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Missing auth user" });
    }

    const { roomId, date, start, end, notes } = req.body || {};
    if (!roomId || !date || !start || !end) {
      return res.status(400).json({ ok: false, message: "Missing required fields" });
    }

    const startTime = toDateLocal(date, start);
    const endTime   = toDateLocal(date, end);
    if (!(endTime > startTime)) {
      return res.status(400).json({ ok: false, message: "End time must be later than start time" });
    }

    // Check overlap within the same creator's calendar
    const hasConflict = await Booking.hasConflict(userId, startTime, endTime);
    if (hasConflict) {
      return res.status(409).json({ ok: false, message: "Time slot already booked for this user" });
    }

    // Directly create a booked slot (creator is the booker)
    const doc = await Booking.create({
      creator: userId,
      booker: userId,
      startTime,
      endTime,
      status: "booked",
      location: rooms.find(r => r.id === roomId)?.name || "",
      notes: notes || "",
      roomId, // now persisted by schema
    });

    res.json({ ok: true, booking: asClient(doc) });
  } catch (e) {
    console.error("[Booking][create] error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// GET /api/bookings/:id
exports.detail = async (req, res) => {
  try {
    const doc = await Booking.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Booking not found" });
    res.json({ ok: true, booking: asClient(doc) });
  } catch (e) {
    console.error("[Booking][detail] error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// POST /api/bookings/:id/join
exports.join = async (req, res) => {
  try {
    const userId = parseUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: "Missing auth user" });
    }
    const updated = await Booking.reserve({ slotId: req.params.id, bookerId: userId });
    if (!updated) {
      return res.status(409).json({ ok: false, message: "Already booked or not available" });
    }
    res.json({ ok: true, booking: asClient(updated) });
  } catch (e) {
    console.error("[Booking][join] error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// POST /api/bookings/:id/leave
exports.leave = async (req, res) => {
  try {
    const userId = parseUserId(req);
    const doc = await Booking.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Booking not found" });

    if (String(doc.booker) !== String(userId) && String(doc.creator) !== String(userId)) {
      return res.status(403).json({ ok: false, message: "Not allowed" });
    }
    const updated = await Booking.cancel({ slotId: req.params.id });
    res.json({ ok: true, booking: asClient(updated) });
  } catch (e) {
    console.error("[Booking][leave] error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};

// DELETE /api/bookings/:id
exports.remove = async (req, res) => {
  try {
    const userId = parseUserId(req);
    const doc = await Booking.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ ok: false, message: "Booking not found" });
    if (String(doc.creator) !== String(userId)) {
      return res.status(403).json({ ok: false, message: "Only owner can delete" });
    }
    await Booking.deleteOne({ _id: req.params.id });
    res.json({ ok: true, deleted: req.params.id });
  } catch (e) {
    console.error("[Booking][remove] error:", e);
    res.status(500).json({ ok: false, message: "Server error" });
  }
};
