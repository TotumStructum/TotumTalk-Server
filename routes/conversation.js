const router = require("express").Router();

const authController = require("../controllers/authController");
const conversationController = require("../controllers/conversationController");

router.use(authController.protect);

router.get("/direct", conversationController.getDirectConversations);
router.get("/group", conversationController.getGroupConversations);
router.post("/group", conversationController.createGroupConversation);

router.get(
  "/:conversationId/messages",
  conversationController.getConversationMessages,
);

module.exports = router;
