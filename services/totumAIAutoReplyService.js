const { generateTotumAIReply } = require("./totumAIClient");

const HISTORY_LIMIT = 8;

const buildTotumAIHistory = ({ conversation, userId, totumAIUserId }) => {
  const userIdString = userId.toString();
  const totumAIUserIdString = totumAIUserId.toString();

  return conversation.messages
    .slice(0, -1)
    .slice(-HISTORY_LIMIT)
    .filter((message) => {
      return ["Text", "Link"].includes(message.type) && message.text;
    })
    .map((message) => {
      const fromId = message.from.toString();

      return {
        role: fromId === totumAIUserIdString ? "assistant" : "user",
        content: message.text,
      };
    })
    .filter((item) => {
      return (
        ["user", "assistant"].includes(item.role) &&
        item.content &&
        item.content.trim()
      );
    })
    .map((item) => ({
      role: item.role,
      content: item.content.trim(),
    }));
};

const createTotumAIAutoReply = async ({
  conversation,
  userId,
  totumAIUserId,
  message,
}) => {
  const aiResponse = await generateTotumAIReply({
    userId,
    message,
    history: buildTotumAIHistory({
      conversation,
      userId,
      totumAIUserId,
    }),
  });

  const replyText = aiResponse.reply.trim();

  conversation.messages.push({
    to: userId,
    from: totumAIUserId,
    type: "Text",
    text: replyText,
  });

  await conversation.save();

  return {
    message: conversation.messages[conversation.messages.length - 1],
    provider: aiResponse.provider,
  };
};

exports.createTotumAIAutoReply = createTotumAIAutoReply;
exports.buildTotumAIHistory = buildTotumAIHistory;
