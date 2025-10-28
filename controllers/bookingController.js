// controllers/bookingController.js
const Booking = require("../models/booking");

// 你的房间列表（与前端一致）
const rooms = [
  { id: "r1", name: "Room A", capacity: 6,  location: "1F", tags: ["projector"] },
  { id: "r2", name: "Room B", capacity: 10, location: "2F", tags: ["whiteboard"] },
  { id: "r3", name: "Room C", capacity: 8,  location: "3F", tags: ["conference"] },
];

function parseUserId(req) {
  // 你的 token 里 uid 是 Mongo _id 字符串；中间件可能把 user 放在 req.user / req.user.id / req.user._id
  return req.user?.id || req.user?._id || req.user?.uid;
}

function toDateLocal(dateStr, hhmm) {
  // 将 "YYYY-MM-DD" + "HH:MM" 转为本地时区 Date
  const [y, m, d] = String(dateStr).split("-").map(Number);
  const [hh, mm] = String(hhmm).split(":").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return dt;
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fmtHM(d)   { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

// 把模型文档映射成前端期望的 booking 对象
function asClient(b) {
  const start = new Date(b.startTime);
  const end   = new Date(b.endTime);
  // 选出房间名（如果前端需要 roomName）
  const room = rooms.find(r => r.id === b.roomId);
  return {
    id: String(b._id),                      // 前端原来是 "时间戳-随机串"，现在用 _id 也行
    uid: String(b.creator),                 // 作为 owner
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
    const filter = mine
      ? { $or: [{ creator: userId }, { booker: userId }] }
      : {};
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
    const { roomId, date, start, end, notes } = req.body || {};
    if (!roomId || !date || !start || !end) {
      return res.status(400).json({ ok: false, message: "Missing required fields" });
    }
    const startTime = toDateLocal(date, start);
    const endTime   = toDateLocal(date, end);
    if (!(endTime > startTime)) {
      return res.status(400).json({ ok: false, message: "End time must be later than start time" });
    }

    // 冲突：同一个 creator 的可用/已预定时段不能重叠
    const hasConflict = await Booking.hasConflict(userId, startTime, endTime);
    if (hasConflict) {
      return res.status(409).json({ ok: false, message: "Time slot already booked for this user" });
    }

    // 你的原前端创建后就“确认”的语义，这里直接落地为 booked（创建人即为 booker）
    const doc = await Booking.create({
      creator: userId,
      booker: userId,
      startTime,
      endTime,
      status: "booked",
      location: rooms.find(r => r.id === roomId)?.name || "",
      notes: notes || "",
      roomId, // 额外储存，方便返回
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

// POST /api/bookings/:id/join  -> 预定空闲时段（把自己设为 booker）
exports.join = async (req, res) => {
  try {
    const userId = parseUserId(req);
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

// POST /api/bookings/:id/leave  -> 取消预定（booker 或 creator 都可取消）
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

// DELETE /api/bookings/:id  -> 仅 creator 可删除
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
