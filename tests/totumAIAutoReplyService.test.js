const User = require("../models/user");
const OneToOneMessage = require("../models/OneToOneMessage");
const {
  buildTotumAIHistory,
  createTotumAIAutoReply,
} = require("../services/totumAIAutoReplyService");
const { generateTotumAIReply } = require("../services/totumAIClient");

jest.mock("../services/totumAIClient", () => ({
  generateTotumAIReply: jest.fn(),
}));

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Test",
    lastName: "User",
    email: "user@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: true,
    ...overrides,
  });
};

describe("totumAIAutoReplyService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("builds dialogue history from previous direct text messages", async () => {
    const user = await createUser({
      email: "ai-history-user@example.com",
    });

    const totumAIUser = await User.create({
      firstName: "TotumAI",
      lastName: "Assistant",
      email: "ai-history-system@example.com",
      verified: true,
      isAI: true,
      isSystem: true,
      systemKey: "TEST_AI_HISTORY",
    });

    const conversation = await OneToOneMessage.create({
      participants: [user._id, totumAIUser._id],
      messages: [
        {
          to: totumAIUser._id,
          from: user._id,
          type: "Text",
          text: "Hello",
        },
        {
          to: user._id,
          from: totumAIUser._id,
          type: "Text",
          text: "Hello from AI",
        },
        {
          to: totumAIUser._id,
          from: user._id,
          type: "Document",
          file: "http://localhost:3000/uploads/documents/file.pdf",
        },
        {
          to: totumAIUser._id,
          from: user._id,
          type: "Text",
          text: "Current message",
        },
      ],
    });

    const history = buildTotumAIHistory({
      conversation,
      userId: user._id,
      totumAIUserId: totumAIUser._id,
    });

    expect(history).toEqual([
      {
        role: "user",
        content: "Hello",
      },
      {
        role: "assistant",
        content: "Hello from AI",
      },
    ]);
  });

  it("creates and saves a TotumAI reply message", async () => {
    generateTotumAIReply.mockResolvedValueOnce({
      reply: "Hello, I am TotumAI.",
      provider: "mock",
    });

    const user = await createUser({
      email: "ai-reply-user@example.com",
    });

    const totumAIUser = await User.create({
      firstName: "TotumAI",
      lastName: "Assistant",
      email: "ai-reply-system@example.com",
      verified: true,
      isAI: true,
      isSystem: true,
      systemKey: "TEST_AI_REPLY",
    });

    const conversation = await OneToOneMessage.create({
      participants: [user._id, totumAIUser._id],
      messages: [
        {
          to: totumAIUser._id,
          from: user._id,
          type: "Text",
          text: "Hi",
        },
      ],
    });

    const result = await createTotumAIAutoReply({
      conversation,
      userId: user._id,
      totumAIUserId: totumAIUser._id,
      message: "Hi",
    });

    expect(generateTotumAIReply).toHaveBeenCalledWith({
      userId: user._id,
      message: "Hi",
      history: [],
    });

    expect(result.provider).toBe("mock");
    expect(result.message.text).toBe("Hello, I am TotumAI.");
    expect(result.message.from.toString()).toBe(totumAIUser._id.toString());
    expect(result.message.to.toString()).toBe(user._id.toString());

    const savedConversation = await OneToOneMessage.findById(conversation._id);

    expect(savedConversation.messages).toHaveLength(2);
    expect(savedConversation.messages[1].text).toBe("Hello, I am TotumAI.");
  });

  it("saves fallback reply returned by TotumAI client", async () => {
    generateTotumAIReply.mockResolvedValueOnce({
      reply: "TotumAI is temporarily unavailable. Please try again later.",
      provider: "fallback",
      error: "Connection refused",
    });

    const user = await createUser({
      email: "ai-fallback-user@example.com",
    });

    const totumAIUser = await User.create({
      firstName: "TotumAI",
      lastName: "Assistant",
      email: "ai-fallback-system@example.com",
      verified: true,
      isAI: true,
      isSystem: true,
      systemKey: "TEST_AI_FALLBACK",
    });

    const conversation = await OneToOneMessage.create({
      participants: [user._id, totumAIUser._id],
      messages: [
        {
          to: totumAIUser._id,
          from: user._id,
          type: "Text",
          text: "Are you there?",
        },
      ],
    });

    const result = await createTotumAIAutoReply({
      conversation,
      userId: user._id,
      totumAIUserId: totumAIUser._id,
      message: "Are you there?",
    });

    expect(result.provider).toBe("fallback");
    expect(result.message.text).toBe(
      "TotumAI is temporarily unavailable. Please try again later.",
    );

    const savedConversation = await OneToOneMessage.findById(conversation._id);

    expect(savedConversation.messages).toHaveLength(2);
    expect(savedConversation.messages[1].from.toString()).toBe(
      totumAIUser._id.toString(),
    );
  });
});
