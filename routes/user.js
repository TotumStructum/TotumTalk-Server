const router = require("express").Router();
const userController = require("../controllers/userController");
const authController = require("../controllers/authController");
const uploadController = require("../controllers/uploadController");

router.patch("/update-me", authController.protect, userController.updateMe);

router.get("/me", authController.protect, userController.getMe);

router.patch(
  "/avatar",
  authController.protect,
  uploadController.uploadAvatarMiddleware,
  userController.updateAvatar,
);

router.delete("/avatar", authController.protect, userController.deleteAvatar);

router.get("/get-users", authController.protect, userController.getUser);

router.get("/get-friends", authController.protect, userController.getFriends);

router.get(
  "/get-friend-requests",
  authController.protect,
  userController.getRequests,
);

router.get(
  "/get-sent-friend-requests",
  authController.protect,
  userController.getSentRequests,
);

router.post("/block/:userId", authController.protect, userController.blockUser);

router.delete(
  "/block/:userId",
  authController.protect,
  userController.unblockUser,
);

module.exports = router;
