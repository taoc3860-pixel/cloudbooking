// server.js
console.log("[BOOT]", __filename);
require("dotenv").config();

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// === Mongo connection ===
const { connectDB } = require("./models/db");

// === App setup ===
const app = express();
const PORT = process.env.PORT || 5055;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

app.use(express.json());

// === Security & headers ===
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

// === Request logging ===
app.use((req, res, next) => {
  const t0 = Date.now();
  console.log(`[REQ] ${req.method} ${req.url}`);
  res.on("finish", () =>
    console.log(`[RES] ${req.method} ${req.url} -> ${res.statusCode} (${Date.now() - t0}ms)`)
  );
  next();
});

// === API routes ===
const authRoutes = require("./routes/authRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const roomRoutes = require("./routes/roomRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/rooms", roomRoutes);

// === Health check ===
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// === Static frontend ===
const webPath = path.join(__dirname, "web");
console.log("[STATIC DIR]", webPath);
app.use(
  express.static(webPath, {
    fallthrough: true,
    setHeaders: (res, filePath) => {
      if (/\.(html|js|css|json|map)$/.test(filePath)) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  })
);
app.get("/", (_req, res) => res.sendFile(path.join(webPath, "index.html")));

// === Boot ===
(async () => {
  await connectDB();
  console.log(
    "[ENV] JWT_SECRET loaded:",
    !!process.env.JWT_SECRET,
    "(using fallback dev-secret =",
    JWT_SECRET === "dev-secret",
    ")"
  );
  app.listen(PORT, () =>
    console.log(`✅ listening http://localhost:${PORT} (connected to MongoDB Atlas)`)
  );
})().catch((err) => {
  console.error("[BOOT] fatal:", err);
  process.exit(1);
});
