const mongoose = require("mongoose");
const GroupMessage = require("../models/GroupMessage");
const User = require("../models/user");

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getSenderAndRecipients = async ({ userId, participants }) => {
  return await Promise.all([
    User.findById(userId).select(
      "firstName lastName _id email status avatar about",
    ),
    User.find({
      _id: { $in: participants },
    }).select("_id socket_id"),
  ]);
};

const buildGroupReplySnapshot = ({ group, replyToMessageId }) => {
  if (!replyToMessageId) return null;

  if (!mongoose.Types.ObjectId.isValid(replyToMessageId)) {
    throw createServiceError("Invalid reply message id");
  }

  const replyMessage = group.messages.id(replyToMessageId);

  if (!replyMessage) {
    throw createServiceError("Reply message not found", 404);
  }

  return {
    messageId: replyMessage._id,
    from: replyMessage.from,
    type: replyMessage.type,
    text: replyMessage.text || "",
    file: replyMessage.file || "",
  };
};

exports.createGroupTextMessage = async ({
  userId,
  groupId,
  message,
  type,
  replyToMessageId,
}) => {
  if (!userId) {
    throw createServiceError("Authenticated user is required", 401);
  }

  if (!groupId) {
    throw createServiceError("Group conversation id is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw createServiceError("Invalid group conversation id");
  }

  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!trimmedMessage) {
    throw createServiceError("Message text cannot be empty");
  }

  if (!["Text", "Link"].includes(type)) {
    throw createServiceError("Invalid message type for group_text_message");
  }

  const group = await GroupMessage.findOne({
    _id: groupId,
    participants: userId,
  });

  if (!group) {
    throw createServiceError("Group conversation not found", 404);
  }

  const replyTo = buildGroupReplySnapshot({
    group,
    replyToMessageId,
  });

  const newMessage = {
    from: userId,
    type,
    text: trimmedMessage,
  };

  if (replyTo) {
    newMessage.replyTo = replyTo;
  }

  group.messages.push(newMessage);

  await group.save();

  const savedMessage = group.messages[group.messages.length - 1].toObject();

  const [sender, recipients] = await getSenderAndRecipients({
    userId,
    participants: group.participants,
  });

  return {
    group,
    message: {
      ...savedMessage,
      from: sender,
    },
    recipients,
  };
};

exports.createGroupFileMessage = async ({
  userId,
  groupId,
  file,
  type,
  text = "",
  replyToMessageId,
}) => {
  if (!userId) {
    throw createServiceError("Authenticated user is required", 401);
  }

  if (!groupId) {
    throw createServiceError("Group conversation id is required");
  }

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    throw createServiceError("Invalid group conversation id");
  }

  if (!["Document", "Media"].includes(type)) {
    throw createServiceError("Invalid message type for group_file_message");
  }

  const fileUrl = typeof file === "string" ? file.trim() : "";
  const messageText = typeof text === "string" ? text.trim() : "";

  if (!fileUrl) {
    throw createServiceError("Group file url is required");
  }

  const group = await GroupMessage.findOne({
    _id: groupId,
    participants: userId,
  });

  if (!group) {
    throw createServiceError("Group conversation not found", 404);
  }

  const newMessage = {
    from: userId,
    type,
    file: fileUrl,
  };

  const replyTo = buildGroupReplySnapshot({
    group,
    replyToMessageId,
  });

  if (messageText) {
    newMessage.text = messageText;
  }

  if (replyTo) {
    newMessage.replyTo = replyTo;
  }

  group.messages.push(newMessage);

  await group.save();

  const savedMessage = group.messages[group.messages.length - 1].toObject();

  const [sender, recipients] = await getSenderAndRecipients({
    userId,
    participants: group.participants,
  });

  return {
    group,
    message: {
      ...savedMessage,
      from: sender,
    },
    recipients,
  };
};
