// server.js — resilient startup: listen first, then retry DB in background (PORT=5055)
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// 需要你的 models/db.js 导出 connectDB, isConnected
const { connectDB, isConnected } = require("./models/db");

const app = express();
const PORT = Number(process.env.PORT) || 5055;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

/* ===== Middlewares ===== */
app.use(cors());
app.use(express.json());

// Debug 头，便于排查
const jwtFp = crypto.createHash("sha256").update(String(JWT_SECRET)).digest("hex").slice(0, 8);
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-App-Instance", `${process.pid}`);
  res.setHeader("X-JWT-Fp", jwtFp);
  next();
});

// 若前端带 Bearer，则把解析到的用户信息放到响应头里方便调试
app.use((req, res, next) => {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) {
    try {
      const p = jwt.verify(h.slice(7).trim(), JWT_SECRET);
      res.setHeader("X-User-Uid", p.uid || p._id || "");
      res.setHeader("X-User-Name", p.username || "");
    } catch {}
  }
  next();
});

// 简单请求日志
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    console.log(`[REQ] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - t0}ms)`);
  });
  next();
});

/* ===== Routes ===== */
const authRoutes = require("./routes/authRoutes");
let bookingRoutes, roomRoutes;
try { bookingRoutes = require("./routes/bookingRoutes"); } catch {}
try { roomRoutes = require("./routes/roomRoutes"); } catch {}

// 健康检查：即便 DB 暂未连上也返回 200（db 字段反映状态）
app.get("/api/healthz", (_req, res) => res.json({ ok: true, db: !!isConnected() }));
app.get("/healthz",   (_req, res) => res.json({ ok: true, db: !!isConnected() }));


// 双挂载：既支持 /auth，也兼容 /api/auth（万一前端还没全改）
app.use(["/auth", "/api/auth"], authRoutes);
if (bookingRoutes) app.use(["/bookings", "/api/bookings"], bookingRoutes);
if (roomRoutes)    app.use(["/rooms", "/api/rooms"],       roomRoutes);


// 静态页面（由 Express 提供，Nginx 反代 / 到这里）
const webPath = path.join(__dirname, "web");
app.use(express.static(webPath));
app.get("/", (_req, res) => res.sendFile(path.join(webPath, "index.html")));

/* ===== 关键修复：先启动 HTTP，再后台重试连接 DB ===== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ HTTP server up at http://localhost:${PORT}`);
});

// 连接 DB 的外层重试，不再因为临时失败而退出进程
(async function connectWithRetry() {
  const maxAttempts = 20;
  const baseMs = 1500; // 线性退避，最多 10s 间隔
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      // 由 models/db.js 执行一次连接尝试；失败抛错由此处接管重试
      await connectDB(1);
      console.log("[DB] ✅ Connected");
      return;
    } catch (err) {
      const delay = Math.min(10000, baseMs * i);
      console.error(`[DB] ❌ connect failed (attempt ${i}/${maxAttempts}): ${err?.message || err}`);
      if (i === maxAttempts) {
        console.error("[DB] giving up; HTTP stays online; DB-backed routes will fail until DB recovers.");
        return;
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
})();
