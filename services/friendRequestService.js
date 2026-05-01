const mongoose = require("mongoose");
const FriendRequest = require("../models/friendRequest");

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

exports.rejectFriendRequest = async ({ userId, requestId }) => {
  if (!userId) {
    throw createServiceError("Authenticated user is required", 401);
  }

  if (!requestId) {
    throw createServiceError("Friend request id is required");
  }

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw createServiceError("Invalid friend request id");
  }

  const request = await FriendRequest.findById(requestId).populate(
    "sender recipient",
    "_id socket_id",
  );

  if (!request) {
    throw createServiceError("Friend request not found", 404);
  }

  if (request.recipient._id.toString() !== userId.toString()) {
    throw createServiceError("You are not allowed to reject this request", 403);
  }

  await FriendRequest.findByIdAndDelete(requestId);

  return {
    sender: request.sender,
    recipient: request.recipient,
  };
};
