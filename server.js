// server.js — resilient startup: listen first, then retry DB in background (PORT=5055)
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { connectDB, isConnected } = require("./models/db");

const app = express();
const PORT = Number(process.env.PORT) || 5055;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

/* ===== Middlewares ===== */
app.use(cors());
app.use(express.json());

// Debug-friendly headers
const jwtFp = crypto.createHash("sha256").update(String(JWT_SECRET)).digest("hex").slice(0, 8);
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-App-Instance", `${process.pid}`);
  res.setHeader("X-JWT-Fp", jwtFp);
  next();
});

// Attach user headers if token present
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

// Minimal request log
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

// Health (works even if DB not yet connected)
app.get("/api/healthz", (_req, res) =>
  res.json({ ok: true, db: !!isConnected() })
);
app.get("/healthz", (_req, res) =>
  res.json({ ok: true, db: !!isConnected() })
);

// API prefix
app.use("/api/auth", authRoutes);
if (bookingRoutes) app.use("/api/bookings", bookingRoutes);
if (roomRoutes) app.use("/api/rooms", roomRoutes);

// Static frontend via Express
const webPath = path.join(__dirname, "web");
app.use(express.static(webPath));
app.get("/", (_req, res) => res.sendFile(path.join(webPath, "index.html")));

/* ===== Start server first ===== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ HTTP server up at http://localhost:${PORT}`);
});

/* ===== Then connect DB in background with retries ===== */
(async function connectWithRetry() {
  const maxAttempts = 20;
  const base = 1500; // ms
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await connectDB(1); // let models/db.js handle a single attempt
      console.log("[DB] ✅ Connected");
      return;
    } catch (err) {
      const delay = Math.min(10000, base * i); // linear backoff up to 10s
      console.error(`[DB] ❌ connect failed (attempt ${i}/${maxAttempts}): ${err?.message || err}`);
      if (i === maxAttempts) {
        console.error("[DB] giving up; HTTP stays online for health/proxy, but DB-backed routes will fail until DB recovers.");
        return;
      }
      await new Promise(r => setTimeout(r, delay));
    }
  }
})();
