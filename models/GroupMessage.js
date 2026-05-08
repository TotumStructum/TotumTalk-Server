const mongoose = require("mongoose");

const groupMessageSchema = new mongoose.Schema(
  {
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
    replyTo: {
      messageId: {
        type: mongoose.Schema.ObjectId,
      },
      from: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
      type: {
        type: String,
        enum: ["Text", "Media", "Document", "Link"],
      },
      text: {
        type: String,
        trim: true,
      },
      file: {
        type: String,
        trim: true,
      },
    },
    deletedFor: [
      {
        type: mongoose.Schema.ObjectId,
        ref: "User",
      },
    ],
  },
  { _id: true },
);

const groupConversationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      required: [true, "Group title is required"],
      maxlength: [80, "Group title must be shorter than 80 characters"],
    },
    creator: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: true,
    },
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
            return value.length >= 1;
          },
          message: "Group conversation must have at least 1 participant",
        },
        {
          validator: function (value) {
            return (
              new Set(value.map((id) => id.toString())).size === value.length
            );
          },
          message: "Group conversation participants must be unique",
        },
      ],
    },
    messages: [groupMessageSchema],
  },
  { timestamps: true },
);

const GroupMessage = mongoose.model("GroupMessage", groupConversationSchema);

module.exports = GroupMessage;
