const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    to: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    from: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["Text", "Media", "Document", "Link"],
      required: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    text: {
      type: String,
      trim: true,
      required: function () {
        return ["Text", "Link"].includes(this.type);
      },
    },
    file: {
      type: String,
      trim: true,
      required: function () {
        return ["Media", "Document"].includes(this.type);
      },
    },
  },
  { _id: true },
);

const oneToOneMessageSchema = new mongoose.Schema(
  {
    participants: {
      type: [
        {
          type: mongoose.Schema.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      validate: [
        {
          validator: function (value) {
            return value.length === 2;
          },
          message: "One-to-one conversation must have exactly 2 participants",
        },
        {
          validator: function (value) {
            return (
              value[0] &&
              value[1] &&
              value[0].toString() !== value[1].toString()
            );
          },
          message:
            "Participants in one-to-one conversation must be different users",
        },
      ],
    },
    messages: [messageSchema],
  },
  { timestamps: true },
);

const OneToOneMessage = mongoose.model(
  "OneToOneMessage",
  oneToOneMessageSchema,
);

module.exports = OneToOneMessage;
