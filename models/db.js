// models/db.js
const mongoose = require("mongoose");

const { MONGODB_URI, DB_NAME = "cloudbooking" } = process.env;

// keep a single connection promise
let ready = null;

function connectDB() {
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is missing. Put your Atlas SRV string in .env (MONGODB_URI=...)"
    );
  }
  if (!ready) {
    // Recommended options for Atlas + Mongoose 7+
    ready = mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,
      // Pool & topology
      maxPoolSize: 20,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      // Let Mongoose use MongoDB Stable API v1 when available
      // (works even if serverApi not set explicitly)
      // retryWrites is typically handled by the connection string (?retryWrites=true)
    });

    mongoose.connection.on("connected", () => {
      console.log("[Mongo] connected to Atlas, db:", DB_NAME);
    });
    mongoose.connection.on("error", (e) => {
      console.error("[Mongo] error:", e?.message || e);
    });
    mongoose.connection.on("disconnected", () => {
      console.warn("[Mongo] disconnected");
    });
  }
  return ready;
}

module.exports = { connectDB };
