const router = require("express").Router();

const authController = require("../controllers/authController");
const conversationController = require("../controllers/conversationController");

router.use(authController.protect);

router.get("/direct", conversationController.getDirectConversations);
router.get("/group", conversationController.getGroupConversations);
router.post("/group", conversationController.createGroupConversation);
router.get(
  "/group/:groupId/messages",
  conversationController.getGroupConversationMessages,
);

router.delete(
  "/group/:groupId/leave",
  conversationController.leaveGroupConversation,
);

router.patch(
  "/group/:groupId/participants",
  conversationController.addGroupParticipants,
);

router.delete(
  "/group/:groupId/participants",
  conversationController.removeGroupParticipants,
);

router.patch("/group/:groupId", conversationController.updateGroupConversation);

router.patch(
  "/:conversationId/messages/:messageId/star",
  conversationController.toggleDirectMessageStar,
);

router.delete(
  "/:conversationId/messages/:messageId",
  conversationController.deleteDirectMessageForMe,
);

router.delete(
  "/:conversationId",
  conversationController.deleteDirectConversation,
);

router.get(
  "/:conversationId/messages",
  conversationController.getConversationMessages,
);

module.exports = router;
