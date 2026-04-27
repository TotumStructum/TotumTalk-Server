const mongoose = require("mongoose");
const OneToOneMessage = require("../models/OneToOneMessage");
const catchAsync = require("../utils/catchAsync");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/user");

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

exports.createGroupConversation = catchAsync(async (req, res, next) => {
  const { title, members } = req.body;
  const trimmedTitle = typeof title === "string" ? title.trim() : "";

  if (!trimmedTitle) {
    return res.status(400).json({
      status: "error",
      message: "Group title is required",
    });
  }

  if (trimmedTitle.length > 80) {
    return res.status(400).json({
      status: "error",
      message: "Group title must be shorter than 80 characters",
    });
  }

  if (!Array.isArray(members)) {
    return res.status(400).json({
      status: "error",
      message: "Group members are required",
    });
  }

  const uniqueMemberIds = [
    ...new Set(members.map((memberId) => memberId?.toString()).filter(Boolean)),
  ];

  if (uniqueMemberIds.length < 2) {
    return res.status(400).json({
      status: "error",
      message: "Group must have at least 2 members besides you",
    });
  }

  const currentUserId = req.user._id.toString();

  if (uniqueMemberIds.includes(currentUserId)) {
    return res.status(400).json({
      status: "error",
      message: "Do not include yourself in group members",
    });
  }

  const hasInvalidMemberId = uniqueMemberIds.some(
    (memberId) => !mongoose.Types.ObjectId.isValid(memberId),
  );

  if (hasInvalidMemberId) {
    return res.status(400).json({
      status: "error",
      message: "Invalid group member id",
    });
  }

  const existingMembersCount = await User.countDocuments({
    _id: { $in: uniqueMemberIds },
  });

  if (existingMembersCount !== uniqueMemberIds.length) {
    return res.status(404).json({
      status: "error",
      message: "One or more group members were not found",
    });
  }

  const friendIds = req.user.friends.map((friendId) => friendId.toString());
  const allMembersAreFriends = uniqueMemberIds.every((memberId) =>
    friendIds.includes(memberId),
  );

  if (!allMembersAreFriends) {
    return res.status(403).json({
      status: "error",
      message: "You can create groups only with friends",
    });
  }

  let group = await GroupMessage.create({
    title: trimmedTitle,
    creator: req.user._id,
    participants: [req.user._id, ...uniqueMemberIds],
  });

  group = await GroupMessage.findById(group._id).populate(
    "participants",
    "firstName lastName _id email status avatar about",
  );

  return res.status(201).json({
    status: "success",
    data: group,
  });
});
