const mongoose = require("mongoose");

const callLogSchema = new mongoose.Schema(
  {
    call_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    caller: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    conversation: {
      type: mongoose.Schema.ObjectId,
      ref: "OneToOneMessage",
      required: true,
    },
    call_type: {
      type: String,
      enum: ["audio", "video"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "ringing",
        "active",
        "missed",
        "declined",
        "cancelled",
        "completed",
      ],
      default: "ringing",
    },
    started_at: {
      type: Date,
      default: Date.now,
    },
    answered_at: {
      type: Date,
    },
    ended_at: {
      type: Date,
    },
    duration_seconds: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

const CallLog = mongoose.model("CallLog", callLogSchema);

module.exports = CallLog;
