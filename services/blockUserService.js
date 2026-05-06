const mongoose = require("mongoose");
const User = require("../models/user");

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const hasId = (ids = [], targetId) => {
  return ids.some((id) => id.toString() === targetId.toString());
};

const validateUserPair = ({ userId, targetUserId }) => {
  if (!userId) {
    throw createServiceError("Authenticated user is required", 401);
  }

  if (!targetUserId) {
    throw createServiceError("Target user id is required");
  }

  if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
    throw createServiceError("Invalid target user id");
  }

  if (userId.toString() === targetUserId.toString()) {
    throw createServiceError("You cannot block yourself");
  }
};

exports.blockUser = async ({ userId, targetUserId }) => {
  validateUserPair({ userId, targetUserId });

  const [user, targetUser] = await Promise.all([
    User.findById(userId).select("_id friends blockedUsers"),
    User.findById(targetUserId).select("_id friends blockedUsers isSystem"),
  ]);

  if (!user || !targetUser) {
    throw createServiceError("User not found", 404);
  }

  if (targetUser.isSystem) {
    throw createServiceError("System contact cannot be blocked", 400);
  }

  if (!hasId(user.blockedUsers, targetUserId)) {
    user.blockedUsers.push(targetUserId);
  }

  user.friends = user.friends.filter(
    (friendId) => friendId.toString() !== targetUserId.toString(),
  );

  targetUser.friends = targetUser.friends.filter(
    (friendId) => friendId.toString() !== userId.toString(),
  );

  await Promise.all([
    user.save({ validateModifiedOnly: true }),
    targetUser.save({ validateModifiedOnly: true }),
  ]);

  return {
    user,
    targetUser,
  };
};

exports.unblockUser = async ({ userId, targetUserId }) => {
  validateUserPair({ userId, targetUserId });

  const user = await User.findById(userId).select("_id blockedUsers");

  if (!user) {
    throw createServiceError("User not found", 404);
  }

  user.blockedUsers = user.blockedUsers.filter(
    (blockedUserId) => blockedUserId.toString() !== targetUserId.toString(),
  );

  await user.save({ validateModifiedOnly: true });

  return {
    user,
  };
};

exports.ensureUsersCanDirectMessage = async ({ senderId, recipientId }) => {
  validateUserPair({
    userId: senderId,
    targetUserId: recipientId,
  });

  const [sender, recipient] = await Promise.all([
    User.findById(senderId).select("_id blockedUsers"),
    User.findById(recipientId).select("_id blockedUsers isSystem"),
  ]);

  if (!sender || !recipient) {
    throw createServiceError("User not found", 404);
  }

  if (hasId(sender.blockedUsers, recipientId)) {
    throw createServiceError("You blocked this user", 403);
  }

  if (hasId(recipient.blockedUsers, senderId)) {
    throw createServiceError("You cannot message this user", 403);
  }

  return {
    sender,
    recipient,
  };
};
