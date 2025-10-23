// models/Booking.js
const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    // the owner/provider of the time slot
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // the consumer who reserves the slot (nullable when available)
    booker: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },

    startTime: { type: Date, required: true, index: true },
    endTime:   { type: Date, required: true },

    status: {
      type: String,
      enum: ["available", "booked", "cancelled"],
      default: "available",
      index: true,
    },

    location: { type: String, trim: true, maxlength: 120 },   // optional
    notes: { type: String, maxlength: 500 },
    // soft-delete flag if you ever need it:
    // deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// basic validation
bookingSchema.path("endTime").validate(function (v) {
  return v > this.startTime;
}, "endTime must be greater than startTime");

// optional: enforce a max duration (e.g., 4 hours)
bookingSchema.pre("validate", function (next) {
  const maxMs = 4 * 60 * 60 * 1000;
  if (this.endTime && this.startTime && (this.endTime - this.startTime) > maxMs) {
    return next(new Error("Slot duration exceeds 4 hours"));
  }
  next();
});

// indexes for common queries
bookingSchema.index({ creator: 1, startTime: 1 });
bookingSchema.index({ booker: 1, startTime: 1 });

// overlap check for a creator's calendar
bookingSchema.statics.hasConflict = async function (creatorId, startTime, endTime, excludeId = null) {
  const filter = {
    creator: creatorId,
    status: { $in: ["available", "booked"] },
    $or: [{ startTime: { $lt: endTime }, endTime: { $gt: startTime } }],
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return !!(await this.exists(filter));
};

// create an available slot with conflict guard
bookingSchema.statics.createSlot = async function ({ creator, startTime, endTime, location, notes }) {
  const conflict = await this.hasConflict(creator, startTime, endTime);
  if (conflict) {
    const err = new Error("Time slot conflicts with existing one");
    err.code = "TIME_CONFLICT";
    throw err;
  }
  return this.create({ creator, startTime, endTime, location, notes, status: "available" });
};

// reserve only if still available (prevents double booking)
bookingSchema.statics.reserve = function ({ slotId, bookerId }) {
  return this.findOneAndUpdate(
    { _id: slotId, status: "available", booker: null },
    { $set: { status: "booked", booker: bookerId } },
    { new: true }
  );
};

// cancel only if you are the booker or creator (check in controller)
bookingSchema.statics.cancel = function ({ slotId }) {
  return this.findOneAndUpdate(
    { _id: slotId, status: { $in: ["available", "booked"] } },
    { $set: { status: "cancelled", booker: null } },
    { new: true }
  );
};

module.exports = mongoose.model("Booking", bookingSchema);
