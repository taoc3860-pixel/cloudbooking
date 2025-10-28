// server.js — unified CloudBooking version (PORT=5055)
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { connectDB } = require("./models/db");

const app = express();
const PORT = Number(process.env.PORT) || 5055;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

/* ===== Middlewares ===== */
app.use(cors());
app.use(express.json());

// Cache & security headers
const jwtFp = crypto.createHash("sha256").update(String(JWT_SECRET)).digest("hex").slice(0, 8);
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-App-Instance", `${process.pid}`);
  res.setHeader("X-JWT-Fp", jwtFp);
  next();
});

// Attach user info header if token present
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

// Request log
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on("finish", () => {
    console.log(`[REQ] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - t0}ms)`);
  });
  next();
});

/* ===== Routes ===== */
const authRoutes = require("./routes/authRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const roomRoutes = require("./routes/roomRoutes");

// Health endpoints
app.get("/api/healthz", (_req, res) => res.json({ ok: true }));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// API prefix routes
app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/rooms", roomRoutes);

/* ===== Static frontend ===== */
const webPath = path.join(__dirname, "web");
app.use(express.static(webPath));
app.get("/", (_req, res) => res.sendFile(path.join(webPath, "index.html")));

/* ===== Boot ===== */
(async () => {
  await connectDB();
  console.log("[DB] connected to MongoDB Atlas");
  app.listen(PORT, "0.0.0.0", () =>
    console.log(`✅ Server up at http://localhost:${PORT}`)
  );
})().catch((err) => {
  console.error("[BOOT] fatal:", err);
  process.exit(1);
});
