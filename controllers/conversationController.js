const mongoose = require("mongoose");
const OneToOneMessage = require("../models/OneToOneMessage");
const catchAsync = require("../utils/catchAsync");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/user");

exports.getDirectConversations = catchAsync(async (req, res, next) => {
  const conversations = await OneToOneMessage.find({
    participants: req.user._id,
    deletedBy: { $ne: req.user._id },
  })
    .populate(
      "participants",
      "firstName lastName _id email status avatar about isAI isSystem",
    )
    .sort({ updatedAt: -1 });

  const currentUserId = req.user._id.toString();

  const blockedUserIds = new Set(
    (req.user.blockedUsers || []).map((userId) => userId.toString()),
  );

  const conversationsWithBlockState = conversations.map((conversation) => {
    const conversationObject = conversation.toObject();

    const otherParticipant = conversationObject.participants.find(
      (participant) => participant._id.toString() !== currentUserId,
    );

    return {
      ...conversationObject,
      blockedByMe: otherParticipant
        ? blockedUserIds.has(otherParticipant._id.toString())
        : false,
    };
  });

  return res.status(200).json({
    status: "success",
    data: conversationsWithBlockState,
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
    deletedBy: { $ne: req.user._id },
  }).select("messages");

  if (!conversation) {
    return res.status(404).json({
      status: "error",
      message: "Conversation not found",
    });
  }

  const currentUserId = req.user._id.toString();

  const visibleMessages = conversation.messages.filter((message) => {
    const deletedFor = Array.isArray(message.deletedFor)
      ? message.deletedFor
      : [];

    return !deletedFor.some((userId) => userId.toString() === currentUserId);
  });

  return res.status(200).json({
    status: "success",
    data: visibleMessages,
  });
});

exports.toggleDirectMessageStar = catchAsync(async (req, res, next) => {
  const { conversationId, messageId } = req.params;
  const { starred } = req.body;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid conversation id",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid message id",
    });
  }

  if (typeof starred !== "boolean") {
    return res.status(400).json({
      status: "error",
      message: "Starred value must be boolean",
    });
  }

  const conversation = await OneToOneMessage.findOne({
    _id: conversationId,
    participants: req.user._id,
    deletedBy: { $ne: req.user._id },
  });

  if (!conversation) {
    return res.status(404).json({
      status: "error",
      message: "Conversation not found",
    });
  }

  const message = conversation.messages.id(messageId);

  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found",
    });
  }

  const currentUserId = req.user._id.toString();

  const isDeletedForCurrentUser = Array.isArray(message.deletedFor)
    ? message.deletedFor.some((userId) => userId.toString() === currentUserId)
    : false;

  if (isDeletedForCurrentUser) {
    return res.status(404).json({
      status: "error",
      message: "Message not found",
    });
  }

  const starredBy = Array.isArray(message.starredBy) ? message.starredBy : [];

  const alreadyStarred = starredBy.some(
    (userId) => userId.toString() === currentUserId,
  );

  if (starred && !alreadyStarred) {
    message.starredBy.push(req.user._id);
  }

  if (!starred && alreadyStarred) {
    message.starredBy = message.starredBy.filter(
      (userId) => userId.toString() !== currentUserId,
    );
  }

  await conversation.save();

  return res.status(200).json({
    status: "success",
    data: message,
    message: starred ? "Message starred" : "Message unstarred",
  });
});

exports.deleteDirectMessageForMe = catchAsync(async (req, res, next) => {
  const { conversationId, messageId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid conversation id",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid message id",
    });
  }

  const conversation = await OneToOneMessage.findOne({
    _id: conversationId,
    participants: req.user._id,
    deletedBy: { $ne: req.user._id },
  });

  if (!conversation) {
    return res.status(404).json({
      status: "error",
      message: "Conversation not found",
    });
  }

  const message = conversation.messages.id(messageId);

  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found",
    });
  }

  const currentUserId = req.user._id.toString();

  const alreadyDeleted = Array.isArray(message.deletedFor)
    ? message.deletedFor.some((userId) => userId.toString() === currentUserId)
    : false;

  if (!alreadyDeleted) {
    message.deletedFor.push(req.user._id);
  }

  message.starredBy = Array.isArray(message.starredBy)
    ? message.starredBy.filter((userId) => userId.toString() !== currentUserId)
    : [];

  await conversation.save();

  return res.status(200).json({
    status: "success",
    data: {
      messageId,
    },
    message: "Message deleted for you",
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

  const systemMembersCount = await User.countDocuments({
    _id: { $in: uniqueMemberIds },
    isSystem: true,
  });

  if (systemMembersCount > 0) {
    return res.status(400).json({
      status: "error",
      message: "System contacts cannot be added to groups",
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

exports.getGroupConversations = catchAsync(async (req, res, next) => {
  const groups = await GroupMessage.find({
    participants: req.user._id,
  })
    .populate(
      "participants",
      "firstName lastName _id email status avatar about",
    )
    .populate("creator", "firstName lastName _id email status avatar about")
    .sort({ updatedAt: -1 });

  return res.status(200).json({
    status: "success",
    data: groups,
  });
});

exports.getGroupConversationMessages = catchAsync(async (req, res, next) => {
  const { groupId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid group conversation id",
    });
  }

  const group = await GroupMessage.findOne({
    _id: groupId,
    participants: req.user._id,
  })
    .select("messages")
    .populate(
      "messages.from",
      "firstName lastName _id email status avatar about",
    );

  if (!group) {
    return res.status(404).json({
      status: "error",
      message: "Group conversation not found",
    });
  }

  const currentUserId = req.user._id.toString();

  const visibleMessages = group.messages.filter((message) => {
    const deletedFor = Array.isArray(message.deletedFor)
      ? message.deletedFor
      : [];

    return !deletedFor.some((userId) => userId.toString() === currentUserId);
  });

  return res.status(200).json({
    status: "success",
    data: visibleMessages,
  });
});

exports.deleteGroupMessageForMe = catchAsync(async (req, res, next) => {
  const { groupId, messageId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid group conversation id",
    });
  }

  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid message id",
    });
  }

  const group = await GroupMessage.findOne({
    _id: groupId,
    participants: req.user._id,
  });

  if (!group) {
    return res.status(404).json({
      status: "error",
      message: "Group conversation not found",
    });
  }

  const message = group.messages.id(messageId);

  if (!message) {
    return res.status(404).json({
      status: "error",
      message: "Message not found",
    });
  }

  const currentUserId = req.user._id.toString();

  const alreadyDeleted = Array.isArray(message.deletedFor)
    ? message.deletedFor.some((userId) => userId.toString() === currentUserId)
    : false;

  if (!alreadyDeleted) {
    message.deletedFor.push(req.user._id);
  }

  await group.save();

  return res.status(200).json({
    status: "success",
    data: {
      groupId,
      messageId,
    },
    message: "Message deleted for you",
  });
});

exports.leaveGroupConversation = catchAsync(async (req, res, next) => {
  const { groupId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid group conversation id",
    });
  }

  const group = await GroupMessage.findOne({
    _id: groupId,
    participants: req.user._id,
  });

  if (!group) {
    return res.status(404).json({
      status: "error",
      message: "Group conversation not found",
    });
  }

  const currentUserId = req.user._id.toString();

  group.participants = group.participants.filter(
    (participantId) => participantId.toString() !== currentUserId,
  );

  await group.save();

  return res.status(200).json({
    status: "success",
    data: {
      groupId,
    },
    message: "You left the group",
  });
});

exports.addGroupParticipants = catchAsync(async (req, res, next) => {
  const { groupId } = req.params;
  const { members } = req.body;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid group conversation id",
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

  if (uniqueMemberIds.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Group members are required",
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

  let group = await GroupMessage.findOne({
    _id: groupId,
    participants: req.user._id,
  });

  if (!group) {
    return res.status(404).json({
      status: "error",
      message: "Group conversation not found",
    });
  }

  if (group.creator.toString() !== currentUserId) {
    return res.status(403).json({
      status: "error",
      message: "Only group creator can add participants",
    });
  }

  const existingParticipantIds = group.participants.map((participantId) =>
    participantId.toString(),
  );

  const hasExistingParticipant = uniqueMemberIds.some((memberId) =>
    existingParticipantIds.includes(memberId),
  );

  if (hasExistingParticipant) {
    return res.status(400).json({
      status: "error",
      message: "One or more users are already group participants",
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

  const systemMembersCount = await User.countDocuments({
    _id: { $in: uniqueMemberIds },
    isSystem: true,
  });

  if (systemMembersCount > 0) {
    return res.status(400).json({
      status: "error",
      message: "System contacts cannot be added to groups",
    });
  }

  const friendIds = req.user.friends.map((friendId) => friendId.toString());
  const allMembersAreFriends = uniqueMemberIds.every((memberId) =>
    friendIds.includes(memberId),
  );

  if (!allMembersAreFriends) {
    return res.status(403).json({
      status: "error",
      message: "You can add only friends to groups",
    });
  }

  group.participants.push(...uniqueMemberIds);

  await group.save();

  group = await GroupMessage.findById(group._id)
    .populate(
      "participants",
      "firstName lastName _id email status avatar about",
    )
    .populate("creator", "firstName lastName _id email status avatar about");

  return res.status(200).json({
    status: "success",
    data: group,
  });
});

exports.removeGroupParticipants = catchAsync(async (req, res, next) => {
  const { groupId } = req.params;
  const { members } = req.body;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid group conversation id",
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

  if (uniqueMemberIds.length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Group members are required",
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

  const currentUserId = req.user._id.toString();

  if (uniqueMemberIds.includes(currentUserId)) {
    return res.status(400).json({
      status: "error",
      message: "Use leave group to remove yourself",
    });
  }

  let group = await GroupMessage.findOne({
    _id: groupId,
    participants: req.user._id,
  });

  if (!group) {
    return res.status(404).json({
      status: "error",
      message: "Group conversation not found",
    });
  }

  const creatorId = group.creator.toString();

  if (creatorId !== currentUserId) {
    return res.status(403).json({
      status: "error",
      message: "Only group creator can remove participants",
    });
  }

  if (uniqueMemberIds.includes(creatorId)) {
    return res.status(400).json({
      status: "error",
      message: "Group creator cannot be removed",
    });
  }

  const existingParticipantIds = group.participants.map((participantId) =>
    participantId.toString(),
  );

  const allMembersAreParticipants = uniqueMemberIds.every((memberId) =>
    existingParticipantIds.includes(memberId),
  );

  if (!allMembersAreParticipants) {
    return res.status(400).json({
      status: "error",
      message: "One or more users are not group participants",
    });
  }

  group.participants = group.participants.filter(
    (participantId) => !uniqueMemberIds.includes(participantId.toString()),
  );

  await group.save();

  group = await GroupMessage.findById(group._id)
    .populate(
      "participants",
      "firstName lastName _id email status avatar about",
    )
    .populate("creator", "firstName lastName _id email status avatar about");

  return res.status(200).json({
    status: "success",
    data: group,
  });
});

exports.updateGroupConversation = catchAsync(async (req, res, next) => {
  const { groupId } = req.params;
  const { title } = req.body;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid group conversation id",
    });
  }

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

  let group = await GroupMessage.findOne({
    _id: groupId,
    participants: req.user._id,
  });

  if (!group) {
    return res.status(404).json({
      status: "error",
      message: "Group conversation not found",
    });
  }

  if (group.creator.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: "error",
      message: "Only group creator can update group",
    });
  }

  group.title = trimmedTitle;

  await group.save();

  group = await GroupMessage.findById(group._id)
    .populate(
      "participants",
      "firstName lastName _id email status avatar about",
    )
    .populate("creator", "firstName lastName _id email status avatar about");

  return res.status(200).json({
    status: "success",
    data: group,
  });
});

exports.deleteGroupConversation = catchAsync(async (req, res, next) => {
  const { groupId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid group conversation id",
    });
  }

  const group = await GroupMessage.findOne({
    _id: groupId,
    participants: req.user._id,
  });

  if (!group) {
    return res.status(404).json({
      status: "error",
      message: "Group conversation not found",
    });
  }

  if (group.creator.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      status: "error",
      message: "Only group creator can delete group",
    });
  }

  await GroupMessage.findByIdAndDelete(groupId);

  return res.status(200).json({
    status: "success",
    data: {
      groupId,
    },
    message: "Group deleted",
  });
});

exports.deleteDirectConversation = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { scope } = req.body;

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid conversation id",
    });
  }

  if (!["me", "everyone"].includes(scope)) {
    return res.status(400).json({
      status: "error",
      message: "Delete scope must be either me or everyone",
    });
  }

  const conversation = await OneToOneMessage.findOne({
    _id: conversationId,
    participants: req.user._id,
  });

  if (!conversation) {
    return res.status(404).json({
      status: "error",
      message: "Conversation not found",
    });
  }

  const hasSystemParticipant = await User.exists({
    _id: { $in: conversation.participants },
    isSystem: true,
  });

  if (hasSystemParticipant) {
    return res.status(400).json({
      status: "error",
      message: "System conversation cannot be deleted",
    });
  }

  if (scope === "everyone") {
    await OneToOneMessage.findByIdAndDelete(conversationId);

    return res.status(200).json({
      status: "success",
      data: null,
      message: "Conversation deleted for everyone",
    });
  }

  const currentUserId = req.user._id.toString();
  const alreadyDeleted = conversation.deletedBy.some(
    (userId) => userId.toString() === currentUserId,
  );

  if (!alreadyDeleted) {
    conversation.deletedBy.push(req.user._id);
    await conversation.save();
  }

  return res.status(200).json({
    status: "success",
    data: conversation,
    message: "Conversation deleted for you",
  });
});
