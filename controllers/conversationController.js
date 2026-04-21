const mongoose = require("mongoose");
const OneToOneMessage = require("../models/OneToOneMessage");
const catchAsync = require("../utils/catchAsync");

exports.getDirectConversations = catchAsync(async (req, res, next) => {
  const conversations = await OneToOneMessage.find({
    participants: req.user._id,
  })
    .populate(
      "participants",
      "firstName lastName _id email status avatar about",
    )
    .sort({ updatedAt: -1 });

  return res.status(200).json({
    status: "success",
    data: conversations,
  });
});

exports.getConversationMessages = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid conversation id",
    });
  }

  const conversation = await OneToOneMessage.findOne({
    _id: conversationId,
    participants: req.user._id,
  }).select("messages");

  if (!conversation) {
    return res.status(404).json({
      status: "error",
      message: "Conversation not found",
    });
  }

  return res.status(200).json({
    status: "success",
    data: conversation.messages,
  });
});
