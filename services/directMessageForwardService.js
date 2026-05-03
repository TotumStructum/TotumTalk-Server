const mongoose = require("mongoose");
const OneToOneMessage = require("../models/OneToOneMessage");
const User = require("../models/user");

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isMessageDeletedForUser = ({ message, userId }) => {
  const deletedFor = Array.isArray(message.deletedFor)
    ? message.deletedFor
    : [];

  return deletedFor.some(
    (deletedUserId) => deletedUserId.toString() === userId.toString(),
  );
};

const validateObjectId = ({ value, message }) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw createServiceError(message);
  }
};

const buildForwardedMessage = ({
  sourceMessage,
  userId,
  targetConversation,
}) => {
  const targetUserId = targetConversation.participants.find(
    (participantId) => participantId.toString() !== userId.toString(),
  );

  if (!targetUserId) {
    throw createServiceError("Target conversation recipient not found");
  }

  const newMessage = {
    to: targetUserId,
    from: userId,
    type: sourceMessage.type,
    forwardedFrom: {
      messageId: sourceMessage._id,
      from: sourceMessage.from,
      type: sourceMessage.type,
      text: sourceMessage.text || "",
      file: sourceMessage.file || "",
    },
  };

  if (["Text", "Link"].includes(sourceMessage.type)) {
    newMessage.text = sourceMessage.text;
  }

  if (["Document", "Media"].includes(sourceMessage.type)) {
    newMessage.file = sourceMessage.file;

    if (sourceMessage.text) {
      newMessage.text = sourceMessage.text;
    }
  }

  return newMessage;
};

exports.forwardDirectMessage = async ({
  userId,
  sourceConversationId,
  messageId,
  targetConversationId,
}) => {
  if (!userId) {
    throw createServiceError("Authenticated user is required", 401);
  }

  validateObjectId({
    value: sourceConversationId,
    message: "Invalid source conversation id",
  });

  validateObjectId({
    value: messageId,
    message: "Invalid message id",
  });

  validateObjectId({
    value: targetConversationId,
    message: "Invalid target conversation id",
  });

  if (sourceConversationId.toString() === targetConversationId.toString()) {
    throw createServiceError("Target conversation must be different");
  }

  const [sourceConversation, targetConversation] = await Promise.all([
    OneToOneMessage.findOne({
      _id: sourceConversationId,
      participants: userId,
      deletedBy: { $ne: userId },
    }),
    OneToOneMessage.findOne({
      _id: targetConversationId,
      participants: userId,
      deletedBy: { $ne: userId },
    }),
  ]);

  if (!sourceConversation) {
    throw createServiceError("Source conversation not found", 404);
  }

  if (!targetConversation) {
    throw createServiceError("Target conversation not found", 404);
  }

  const sourceMessage = sourceConversation.messages.id(messageId);

  if (
    !sourceMessage ||
    isMessageDeletedForUser({ message: sourceMessage, userId })
  ) {
    throw createServiceError("Message not found", 404);
  }

  const newMessage = buildForwardedMessage({
    sourceMessage,
    userId,
    targetConversation,
  });

  targetConversation.messages.push(newMessage);

  await targetConversation.save();

  const savedMessage =
    targetConversation.messages[targetConversation.messages.length - 1];

  const recipients = await User.find({
    _id: { $in: targetConversation.participants },
  }).select("_id socket_id");

  return {
    conversation: targetConversation,
    message: savedMessage,
    recipients,
  };
};
