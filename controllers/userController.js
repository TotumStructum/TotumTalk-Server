const FriendRequest = require("../models/friendRequest");
const User = require("../models/user");
const filterObj = require("../utils/filterObj");
const catchAsync = require("../utils/catchAsync");

exports.updateMe = catchAsync(async (req, res, next) => {
  const { user } = req;
  if (req.body.password || req.body.passwordConfirm) {
    return res.status(400).json({
      status: "error",
      message:
        "This route is not for password updates. Please use the appropriate endpoint.",
    });
  }

  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "about",
    "avatar",
  );

  const update_user = await User.findById(user._id);

  if (!update_user) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  Object.assign(update_user, filteredBody);

  await update_user.save({ validateModifiedOnly: true });

  res.status(200).json({
    status: "success",
    data: {
      _id: update_user._id,
      firstName: update_user.firstName,
      lastName: update_user.lastName,
      email: update_user.email,
      about: update_user.about,
      avatar: update_user.avatar,
      status: update_user.status,
    },
    message: "Profile updated successfully",
  });
});

exports.getUser = catchAsync(async (req, res, next) => {
  const currentUserId = req.user._id.toString();

  const pendingRequests = await FriendRequest.find({
    $or: [{ sender: req.user._id }, { recipient: req.user._id }],
  }).select("sender recipient");

  const excludedUserIds = new Set([
    currentUserId,
    ...req.user.friends.map((friendId) => friendId.toString()),
  ]);

  pendingRequests.forEach((request) => {
    excludedUserIds.add(request.sender.toString());
    excludedUserIds.add(request.recipient.toString());
  });

  const remaining_users = await User.find({
    verified: true,
    _id: { $nin: Array.from(excludedUserIds) },
  }).select("_id firstName lastName avatar status");

  res.status(200).json({
    status: "success",
    data: remaining_users,
    message: "Users found successfully!",
  });
});

exports.getRequests = catchAsync(async (req, res, next) => {
  const requests = await FriendRequest.find({
    recipient: req.user._id,
  })
    .populate("sender", "_id firstName lastName avatar status")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    data: requests,
    message: "Friends requests found successfully!",
  });
});

exports.getFriends = catchAsync(async (req, res, next) => {
  const this_user = await User.findById(req.user._id).populate(
    "friends",
    "_id firstName lastName avatar status ",
  );

  if (!this_user) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  res.status(200).json({
    status: "success",
    data: this_user.friends,
    message: "Friends found successfully!",
  });
});

exports.getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).select(
    "_id firstName lastName email about avatar status",
  );

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  res.status(200).json({
    status: "success",
    data: user,
  });
});
