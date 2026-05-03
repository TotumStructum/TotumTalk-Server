const mongoose = require("mongoose");

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

exports.buildDirectReplySnapshot = ({
  conversation,
  replyToMessageId,
  userId,
}) => {
  if (!replyToMessageId) return null;

  if (!mongoose.Types.ObjectId.isValid(replyToMessageId)) {
    throw createServiceError("Invalid reply message id");
  }

  const replyMessage = conversation.messages.id(replyToMessageId);

  if (
    !replyMessage ||
    isMessageDeletedForUser({ message: replyMessage, userId })
  ) {
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
