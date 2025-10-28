// models/Booking.js
const mongoose = require("mongoose");

// Keep in sync with frontend list of rooms
const roomIds = ["r1", "r2", "r3"];

const bookingSchema = new mongoose.Schema(
  {
    // owner/provider of the time slot
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // consumer who reserves the slot (nullable when available)
    booker: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    startTime: { type: Date, required: true, index: true },
    endTime:   { type: Date, required: true },

    status: {
      type: String,
      enum: ["available", "booked", "cancelled"],
      default: "available",
      index: true,
    },

    location: { type: String, trim: true, maxlength: 120 }, // optional
    notes: { type: String, maxlength: 500 },

    // IMPORTANT: persist the room id; otherwise Mongoose strict mode drops it
    roomId: { type: String, enum: roomIds, required: true },
    // deletedAt: { type: Date, default: null }, // optional soft-delete flag
  },
  { timestamps: true }
);

// Basic validation: endTime > startTime
bookingSchema.path("endTime").validate(function (v) {
  return v > this.startTime;
}, "endTime must be greater than startTime");

// Optional: enforce a max duration (e.g., 4 hours)
bookingSchema.pre("validate", function (next) {
  const maxMs = 4 * 60 * 60 * 1000;
  if (this.endTime && this.startTime && (this.endTime - this.startTime) > maxMs) {
    return next(new Error("Slot duration exceeds 4 hours"));
  }
  next();
});

// Useful indexes
bookingSchema.index({ creator: 1, startTime: 1 });
bookingSchema.index({ booker: 1, startTime: 1 });

// Overlap check for a creator's calendar
bookingSchema.statics.hasConflict = async function (creatorId, startTime, endTime, excludeId = null) {
  const filter = {
    creator: creatorId,
    status: { $in: ["available", "booked"] },
    $and: [
      { startTime: { $lt: endTime } },  // existing.start < new.end
      { endTime:   { $gt: startTime } } // existing.end   > new.start
    ],
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return !!(await this.exists(filter));
};

// Create an available slot with conflict guard
bookingSchema.statics.createSlot = async function ({ creator, startTime, endTime, location, notes }) {
  const conflict = await this.hasConflict(creator, startTime, endTime);
  if (conflict) {
    const err = new Error("Time slot conflicts with existing one");
    err.code = "TIME_CONFLICT";
    throw err;
  }
  return this.create({ creator, startTime, endTime, location, notes, status: "available" });
};

// Reserve only if still available (prevents double booking)
bookingSchema.statics.reserve = function ({ slotId, bookerId }) {
  return this.findOneAndUpdate(
    { _id: slotId, status: "available", booker: null },
    { $set: { status: "booked", booker: bookerId } },
    { new: true }
  );
};

// Cancel only if you are the booker or creator (check in controller)
bookingSchema.statics.cancel = function ({ slotId }) {
  return this.findOneAndUpdate(
    { _id: slotId, status: { $in: ["available", "booked"] } },
    { $set: { status: "cancelled", booker: null } },
    { new: true }
  );
};

module.exports = mongoose.model("Booking", bookingSchema);
