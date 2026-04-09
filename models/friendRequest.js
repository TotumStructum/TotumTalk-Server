const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },

  recipient: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now(),
  },
});

requestSchema.index({ sender: 1, recipient: 1 }, { unique: true });

const FriendRequest = new mongoose.model("FriendRequest", requestSchema);
module.exports = FriendRequest;
