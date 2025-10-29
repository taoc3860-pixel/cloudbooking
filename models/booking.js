// models/Booking.js
const mongoose = require("mongoose");
const { Schema, model, Types } = mongoose;

const BookingSchema = new Schema({
  creator: { type: Types.ObjectId, ref: "User", required: true },
  booker:  { type: Types.ObjectId, ref: "User" }, // legacy single-booker (kept for backward compatibility)
  participants: [{ type: Types.ObjectId, ref: "User" }], // NEW: multi-participants
  roomId:   { type: String, required: true },
  location: { type: String },
  startTime:{ type: Date, required: true },
  endTime:  { type: Date, required: true },
  status:   { type: String, enum: ["available","booked","cancelled"], default: "booked" },
  notes:    { type: String, default: "" },
}, { timestamps: true });

// Normalize before save: ensure participants unique, and keep legacy field in sync (optional)
BookingSchema.pre("save", function(next) {
  if (Array.isArray(this.participants)) {
    const uniq = [...new Set(this.participants.map(id => String(id)))].map(id => new Types.ObjectId(id));
    this.participants = uniq;
    // keep legacy 'booker' as the first participant if present
    if (!this.booker && this.participants.length > 0) {
      this.booker = this.participants[0];
    }
  }
  next();
});

// Conflict check (unchanged signature): overlap for this user
BookingSchema.statics.hasConflict = async function(userId, startTime, endTime) {
  return await this.exists({
    $and: [
      { $or: [
          { creator: userId },
          { booker: userId },
          { participants: { $in: [userId] } }, // NEW: consider participants
        ]
      },
      { startTime: { $lt: endTime } },
      { endTime:   { $gt: startTime } }
    ]
  });
};

// Reserve (join) by adding to participants if capacity not exceeded
BookingSchema.statics.reserve = async function({ slotId, bookerId, capacity = 9999 }) {
  const doc = await this.findById(slotId);
  if (!doc) return null;

  // If legacy-only doc, seed participants with existing booker/creator once.
  if (!Array.isArray(doc.participants) || doc.participants.length === 0) {
    const seed = [];
    if (doc.booker)  seed.push(doc.booker);
    else             seed.push(doc.creator);
    doc.participants = seed;
  }

  const alreadyIn = doc.participants.some(id => String(id) === String(bookerId));
  if (alreadyIn) return doc; // idempotent join

  if (doc.participants.length >= capacity) return null; // full

  doc.participants.push(bookerId);
  doc.status = "booked";
  await doc.save();
  return doc;
};

// Cancel (leave): remove from participants; if empty, keep status booked or set available as you prefer
BookingSchema.statics.cancel = async function({ slotId, bookerId }) {
  const doc = await this.findById(slotId);
  if (!doc) return null;

  if (bookerId) {
    doc.participants = (doc.participants || []).filter(id => String(id) !== String(bookerId));
  } else {
    // fallback: clear all (delete scenario handled elsewhere)
    doc.participants = [];
  }

  await doc.save();
  return doc;
};

module.exports = model("Booking", BookingSchema);
