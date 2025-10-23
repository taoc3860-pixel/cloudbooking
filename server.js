// server.js — localhost:5055，持久化版 + 查询他人会议 + 加入/退出
console.log("[BOOT]", __filename);
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const jwt = require("jsonwebtoken");

const app = express();
const PORT = 5055; // 如需 5000 改这里
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

app.use(express.json());

/* ---------------- 简单日志 ---------------- */
app.use((req, res, next) => {
  const t0 = Date.now();
  console.log(`[REQ] ${req.method} ${req.url}`);
  res.on("finish", () => console.log(`[RES] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now()-t0}ms)`));
  next();
});

/* ---------------- 持久化：立即写盘 ---------------- */
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

async function ensureDataDir() { await fs.mkdir(DATA_DIR, { recursive: true }); }
async function saveJSON(file, data) {
  try {
    await ensureDataDir();
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
    console.log("[SAVE OK]", path.basename(file), "->", data.length, "records");
  } catch (err) {
    console.error("[SAVE ERR]", file, err);
  }
}
async function loadJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}

/* ---------------- 内存态（启动时恢复） ---------------- */
let usersArr = [];     // [{uid, username, pass}]
let usersMap = new Map(); // username -> user
let uidSeq = 1;

let bookings = [];     // [{id, uid, roomId, roomName, date, start, end, notes, status, participants:[uid]}]
let bookingSeq = 1;

async function bootstrapData() {
  usersArr = await loadJSON(USERS_FILE, []);
  bookings = await loadJSON(BOOKINGS_FILE, []);

  usersMap = new Map(usersArr.map(u => [u.username, u]));
  uidSeq = usersArr.reduce((m, u) => Math.max(m, parseInt(String(u.uid).replace(/^u/, "")) || 0), 0) + 1;
  bookingSeq = bookings.reduce((m, b) => Math.max(m, parseInt(b.id) || 0), 0) + 1;

  // 兼容老数据：没有 participants 的补上
  for (const b of bookings) {
    if (!Array.isArray(b.participants)) b.participants = [];
  }

  console.log(`[DATA] users=${usersArr.length}, bookings=${bookings.length}`);
}

/* ---------------- 鉴权 ---------------- */
function sign(user) {
  return jwt.sign({ uid: user.uid, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) {
    return res.status(401).json({ ok:false, message:"Missing or invalid Authorization header" });
  }
  try {
    const payload = jwt.verify(h.slice(7).trim(), JWT_SECRET);
    req.user = { uid: payload.uid, username: payload.username };
    next();
  } catch {
    return res.status(401).json({ ok:false, message:"Invalid or expired token" });
  }
}

/* ========================= 1) API ========================= */
// Auth
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok:false, message:"username & password required" });
  if (usersMap.has(username)) return res.status(409).json({ ok:false, message:"User already exists" });
  const user = { uid: "u" + (uidSeq++), username, pass: password }; // demo：明文
  usersArr.push(user); usersMap.set(username, user);
  await saveJSON(USERS_FILE, usersArr);

  // ✅ 关键改动：注册也返回 token，前端 register() 能直接拿到 data.token
  const token = sign(user);
  res.status(201).json({ ok:true, token, uid:user.uid, username:user.username });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok:false, message:"username & password required" });
  const user = usersMap.get(username);
  if (!user || user.pass !== password) return res.status(401).json({ ok:false, message:"Invalid credentials" });
  const token = sign(user);
  res.json({ ok:true, token, uid:user.uid, username:user.username });
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ ok:true, uid:req.user.uid, username:req.user.username });
});

// Rooms（公开）
const rooms = [
  { id: "r1", name: "Room A", capacity: 6,  location: "1F", tags: ["projector"] },
  { id: "r2", name: "Room B", capacity: 10, location: "2F", tags: ["whiteboard"] },
  { id: "r3", name: "Room C", capacity: 8,  location: "3F", tags: ["conference"] },
];
app.get("/api/rooms", (_req, res) => res.json(rooms));

/* ---------------- Bookings（鉴权） ---------------- */

// 我的会议（我创建或我加入的）
app.get("/api/bookings", auth, (req, res) => {
  const mine = req.query.mine === "1";
  if (mine) {
    const list = bookings.filter(b => b.uid === req.user.uid || (Array.isArray(b.participants) && b.participants.includes(req.user.uid)));
    return res.json(list);
  }
  res.json(bookings);
});

// 创建
app.post("/api/bookings", auth, async (req, res) => {
  const { roomId, date, start, end, notes } = req.body || {};
  if (!roomId || !date || !start || !end) return res.status(400).json({ ok:false, message:"Missing required fields" });
  const room = rooms.find(r => r.id === roomId);
  if (!room) return res.status(404).json({ ok:false, message:"Room not found" });

  const id = String(bookingSeq++);
  const booking = {
    id,
    uid: req.user.uid, // 创建者
    roomId,
    roomName: room.name,
    date, start, end,
    notes: notes || "",
    status: "confirmed",
    participants: [req.user.uid], // 创建者默认在参会名单中
  };
  bookings.push(booking);
  await saveJSON(BOOKINGS_FILE, bookings);
  res.json({ ok:true, booking });
});

// 详情（按 ID 查询任意人的预定）
app.get("/api/bookings/:id", auth, (req, res) => {
  const b = bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ ok:false, message:"Booking not found" });
  res.json({ ok:true, booking: b });
});

// 加入会议
app.post("/api/bookings/:id/join", auth, async (req, res) => {
  const b = bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ ok:false, message:"Booking not found" });
  if (!Array.isArray(b.participants)) b.participants = [];
  if (!b.participants.includes(req.user.uid)) b.participants.push(req.user.uid);
  await saveJSON(BOOKINGS_FILE, bookings);
  res.json({ ok:true, booking: b });
});

// 退出会议（不删除会议）
app.post("/api/bookings/:id/leave", auth, async (req, res) => {
  const b = bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ ok:false, message:"Booking not found" });
  b.participants = (b.participants || []).filter(uid => uid !== req.user.uid);
  await saveJSON(BOOKINGS_FILE, bookings);
  res.json({ ok:true, booking: b });
});

// 删除会议（仅创建者可删）
app.delete("/api/bookings/:id", auth, async (req, res) => {
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok:false, message:"Booking not found" });
  if (bookings[idx].uid !== req.user.uid) return res.status(403).json({ ok:false, message:"Only owner can delete" });
  const [del] = bookings.splice(idx, 1);
  await saveJSON(BOOKINGS_FILE, bookings);
  res.json({ ok:true, deleted: del.id });
});

// 健康检查
app.get("/healthz", (_req, res) => res.json({ ok: true }));

/* ======================== 2) 静态（必须在后） ======================== */
const webPath = path.join(__dirname, "web");
console.log("[STATIC DIR]", webPath);
app.use(express.static(webPath, { fallthrough: true }));
app.get("/", (_req, res) => res.sendFile(path.join(webPath, "index.html")));

/* ============================== 启动 =============================== */
(async () => {
  await bootstrapData();
  console.log("[ENV] JWT_SECRET loaded:", !!process.env.JWT_SECRET, "(using fallback dev-secret =", JWT_SECRET === "dev-secret", ")");
  app.listen(PORT, () => {
    console.log(`✅ listening http://localhost:${PORT}`);
  });
})();
