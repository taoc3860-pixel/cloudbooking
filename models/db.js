// models/db.js
const mongoose = require("mongoose");

const { MONGODB_URI, DB_NAME = "cloudbooking" } = process.env;

// Optional: silence deprecation warnings and tighten queries
mongoose.set("strictQuery", true);

let ready = false;

/**
 * Connect to MongoDB Atlas using a single shared Mongoose instance.
 */
async function connectDB() {
  if (!MONGODB_URI) {
    console.error("[Mongo] MONGODB_URI is missing. Put your Atlas SRV string in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,                 // use logical DB name here
      maxPoolSize: 20,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 15000, // fail fast if cluster unreachable
      socketTimeoutMS: 45000,
    });
    ready = true;
    console.log("[Mongo] connected to Atlas, db:", DB_NAME);
  } catch (err) {
    console.error("[Mongo] connection error:", err?.message || err);
    process.exit(1); // do not keep app running without DB
  }

  // (Re)bind listeners once
  const conn = mongoose.connection;
  conn.on("error", (e) => console.error("[Mongo] runtime error:", e?.message || e));
  conn.on("disconnected", () => console.warn("[Mongo] disconnected"));
}

/** Return true if mongoose connection is ready. */
function isConnected() {
  return ready && mongoose.connection.readyState === 1;
}

module.exports = {
  connectDB,
  isConnected,
  mongoose, // export the singleton so all models use the same instance
};
