// models/db.js — robust Atlas connector with clear logs
const mongoose = require("mongoose");

const pick = (...names) => {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return v.trim();
  }
  return "";
};

// 1) 统一用 MONGODB_URI；若为空，再兜底常见别名，最终给出明确报错
const URI =
  pick("MONGODB_URI", "MONGODB_URL", "MONGO_URI", "MONGO_URL", "DATABASE_URL") || "";

if (!URI) {
  console.error(
    "[DB] No Mongo URI found. Please set MONGODB_URI in your environment (.env)."
  );
}

// 2) 小工具：打印脱敏 URI 前缀，方便定位是否真的用了 Atlas 串
function redact(u) {
  try {
    if (!u) return "<empty>";
    const i = u.indexOf("://");
    return i > 0 ? u.slice(0, i + 3) + "***REDACTED***" : "***REDACTED***";
  } catch {
    return "***REDACTED***";
  }
}

let hasConnected = false;

async function connectDB(retries = 10, backoffMs = 1500) {
  if (!URI) throw new Error("MONGODB_URI is empty");

  const opts = {
    // 现代 mongoose 6/7 推荐的最小配置
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    // SRV 记录（mongodb+srv）默认支持，无需额外参数
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(
        `[DB] Connecting to ${redact(URI)} (attempt ${attempt}/${retries})...`
      );
      await mongoose.connect(URI, opts);
      hasConnected = true;
      console.log("[DB] ✅ Connected to MongoDB Atlas");
      // 可选：打印当前数据库名
      console.log("[DB] name:", mongoose.connection.name);
      return mongoose;
    } catch (err) {
      console.error(`[DB] ❌ Connect failed: ${err?.message || err}`);
      if (attempt === retries) {
        console.error("[DB] giving up after retries.");
        throw err;
      }
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}

function isConnected() {
  // 1 = connected, 2 = connecting
  return hasConnected || mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isConnected };
