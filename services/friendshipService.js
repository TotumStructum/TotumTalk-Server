const mongoose = require("mongoose");
const User = require("../models/user");

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

exports.removeFriend = async ({ userId, friendId }) => {
  if (!userId) {
    throw createServiceError("Authenticated user is required", 401);
  }

  if (!friendId) {
    throw createServiceError("Friend id is required");
  }

  if (!mongoose.Types.ObjectId.isValid(friendId)) {
    throw createServiceError("Invalid friend id");
  }

  if (userId.toString() === friendId.toString()) {
    throw createServiceError("You cannot remove yourself as a friend");
  }

  const [user, friend] = await Promise.all([
    User.findById(userId).select("_id friends socket_id"),
    User.findById(friendId).select("_id friends socket_id"),
  ]);

  if (!user || !friend) {
    throw createServiceError("User not found", 404);
  }

  const userHasFriend = user.friends.some(
    (id) => id.toString() === friendId.toString(),
  );

  const friendHasUser = friend.friends.some(
    (id) => id.toString() === userId.toString(),
  );

  if (!userHasFriend && !friendHasUser) {
    throw createServiceError("Users are not friends", 400);
  }

  user.friends = user.friends.filter(
    (id) => id.toString() !== friendId.toString(),
  );

  friend.friends = friend.friends.filter(
    (id) => id.toString() !== userId.toString(),
  );

  await Promise.all([
    user.save({ validateModifiedOnly: true }),
    friend.save({ validateModifiedOnly: true }),
  ]);

  return {
    user,
    friend,
  };
};
