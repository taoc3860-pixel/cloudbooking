// models/db.js
const mongoose = require("mongoose");

const { MONGODB_URI } = process.env;
const DB_NAME = "cloudbooking";

let ready = null;

function connectDB() {
  if (!ready) {
    ready = mongoose.connect(MONGODB_URI, {
      dbName: DB_NAME,
      autoIndex: true,
      maxPoolSize: 10,
    });
    mongoose.connection.on("connected", () => {
      console.log("[Mongo] connected");
    });
    mongoose.connection.on("error", (e) => {
      console.error("[Mongo] error:", e.message);
    });
  }
  return ready;
}

module.exports = { connectDB };
