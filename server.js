console.log("[BOOT]", __filename);
require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const app = express();
const PORT = 5055;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

app.use(express.json());

const jwtFp = crypto.createHash("sha256").update(String(JWT_SECRET)).digest("hex").slice(0, 8);

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  res.setHeader("X-App-Instance", `${process.pid}`);
  res.setHeader("X-JWT-Fp", jwtFp);
  next();
});

app.use((req, res, next) => {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) {
    try {
      const p = jwt.verify(h.slice(7).trim(), JWT_SECRET);
      res.setHeader("X-User-Uid", p.uid || "");
      res.setHeader("X-User-Name", p.username || "");
    } catch {}
  }
  next();
});

app.use((req, res, next) => {
  const t0 = Date.now();
  console.log(`[REQ] ${req.method} ${req.url}`);
  res.on("finish", () =>
    console.log(`[RES] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - t0}ms)`)
  );
  next();
});

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

async function ensureDataDir() { await fs.mkdir(DATA_DIR, { recursive: true }); }
async function saveJSON(file, data) {
  await ensureDataDir();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  console.log("[SAVE OK]", path.basename(file), "->", Array.isArray(data) ? data.length : "-", "records");
}
async function loadJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function timesOverlap(s1, e1, s2, e2) {
  return Math.max(toMinutes(s1), toMinutes(s2)) < Math.min(toMinutes(e1), toMinutes(e2));
}

async function readBookings() {
  try { return JSON.parse(await fs.readFile(BOOKINGS_FILE, "utf8")); } catch { return []; }
}

async function writeBookings(arr) {
  await ensureDataDir();
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(arr, null, 2), "utf8");
}

function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

let usersArr = [];
let usersMap = new Map();
let uidSeq = 1;

async function bootstrapData() {
  usersArr = await loadJSON(USERS_FILE, []);
  usersMap = new Map(usersArr.map(u => [u.username, u]));
  uidSeq = usersArr.reduce((m, u) => Math.max(m, parseInt(String(u.uid).replace(/^u/, "")) || 0), 0) + 1;
  console.log(`[DATA] users=${usersArr.length}`);
}

function sign(user) {
  return jwt.sign({ uid: user.uid, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ")) {
    console.warn("[AUTH] no/invalid Authorization header:", h ? h.slice(0, 20) + "..." : "(empty)");
    return res.status(401).json({ ok:false, message:"Missing or invalid Authorization header" });
  }
  try {
    const payload = jwt.verify(h.slice(7).trim(), JWT_SECRET);
    req.user = { uid: payload.uid, username: payload.username };
    next();
  } catch (e) {
    console.error("[AUTH] verify failed:", e && e.message);
    return res.status(401).json({ ok:false, message:"Invalid or expired token" });
  }
}

app.get("/api/version", (_req, res) => {
  res.json({ version: "file-backed+string-id+nocache+userheaders", pid: process.pid, jwt_fp: jwtFp });
});
app.get("/api/debug", async (_req, res) => {
  const all = await readBookings();
  res.json({ ok:true, pid: process.pid, jwt_fp: jwtFp, users: usersArr.length, bookings: all.length, now: new Date().toISOString() });
});

// Auth
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok:false, message:"username & password required" });
  if (usersMap.has(username)) return res.status(409).json({ ok:false, message:"User already exists" });
  const user = { uid: "u" + (uidSeq++), username, pass: password }; // demo：明文
  usersArr.push(user); usersMap.set(username, user);
  await saveJSON(USERS_FILE, usersArr);
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

const rooms = [
  { id: "r1", name: "Room A", capacity: 6,  location: "1F", tags: ["projector"] },
  { id: "r2", name: "Room B", capacity: 10, location: "2F", tags: ["whiteboard"] },
  { id: "r3", name: "Room C", capacity: 8,  location: "3F", tags: ["conference"] },
];
app.get("/api/rooms", (_req, res) => res.json(rooms));

app.get("/api/bookings", auth, async (req, res) => {
  const all = await readBookings();
  const mine = req.query.mine === "1";
  if (mine) {
    const list = all.filter(b => b.uid === req.user.uid || (Array.isArray(b.participants) && b.participants.includes(req.user.uid)));
    return res.json(list);
  }
  res.json(all);
});

app.post("/api/bookings", auth, async (req, res) => {
  const { roomId, date, start, end, notes } = req.body || {};
  if (!roomId || !date || !start || !end) return res.status(400).json({ ok:false, message:"Missing required fields" });
  const room = rooms.find(r => r.id === roomId);
  if (!room) return res.status(404).json({ ok:false, message:"Room not found" });
  if (toMinutes(end) <= toMinutes(start)) return res.status(400).json({ ok:false, message:"End time must be later than start time" });

  const all = await readBookings();
  const conflict = all.find(b => b.roomId === roomId && b.date === date && timesOverlap(start, end, b.start, b.end));
  if (conflict) {
    return res.status(409).json({
      ok:false,
      message:"Time slot already booked for this room",
      conflict: { id: conflict.id, roomId: conflict.roomId, date: conflict.date, start: conflict.start, end: conflict.end }
    });
  }

  const booking = {
    id: genId(),
    uid: req.user.uid,
    roomId,
    roomName: room.name,
    date, start, end,
    notes: notes || "",
    status: "confirmed",
    participants: [req.user.uid],
  };
  all.push(booking);
  await writeBookings(all);
  res.json({ ok:true, booking });
});

app.get("/api/bookings/:id", auth, async (req, res) => {
  const all = await readBookings();
  const b = all.find(x => String(x.id) === String(req.params.id));
  if (!b) return res.status(404).json({ ok:false, message:"Booking not found" });
  res.json({ ok:true, booking: b });
});

app.post("/api/bookings/:id/join", auth, async (req, res) => {
  const all = await readBookings();
  const idx = all.findIndex(x => String(x.id) === String(req.params.id));
  if (idx < 0) return res.status(404).json({ ok:false, message:"Booking not found" });
  const b = all[idx];
  if (!Array.isArray(b.participants)) b.participants = [];
  if (!b.participants.includes(req.user.uid)) b.participants.push(req.user.uid);
  all[idx] = b;
  await writeBookings(all);
  res.json({ ok:true, booking: b });
});

app.post("/api/bookings/:id/leave", auth, async (req, res) => {
  const all = await readBookings();
  const idx = all.findIndex(x => String(x.id) === String(req.params.id));
  if (idx < 0) return res.status(404).json({ ok:false, message:"Booking not found" });
  const b = all[idx];
  b.participants = (b.participants || []).filter(uid => uid !== req.user.uid);
  all[idx] = b;
  await writeBookings(all);
  res.json({ ok:true, booking: b });
});

app.delete("/api/bookings/:id", auth, async (req, res) => {
  const all = await readBookings();
  const idx = all.findIndex(x => String(x.id) === String(req.params.id));
  if (idx < 0) return res.status(404).json({ ok:false, message:"Booking not found" });
  if (all[idx].uid !== req.user.uid) return res.status(403).json({ ok:false, message:"Only owner can delete" });
  const del = all[idx];
  all.splice(idx, 1);
  await writeBookings(all);
  res.json({ ok:true, deleted: del.id });
});

app.get("/healthz", (_req, res) => res.json({ ok:true }));

const webPath = path.join(__dirname, "web");
console.log("[STATIC DIR]", webPath);
app.use(express.static(webPath, {
  fallthrough: true,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css|json|map)$/.test(filePath)) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }
}));
app.get("/", (_req, res) => res.sendFile(path.join(webPath, "index.html")));

(async () => {
  await bootstrapData();
  console.log("[ENV] JWT_SECRET loaded:", !!process.env.JWT_SECRET, "(using fallback dev-secret =", JWT_SECRET === "dev-secret", ")");
  app.listen(PORT, () => console.log(`✅ listening http://localhost:${PORT}`));
})();
