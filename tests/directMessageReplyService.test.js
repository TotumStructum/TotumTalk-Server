const User = require("../models/user");
const OneToOneMessage = require("../models/OneToOneMessage");
const {
  buildDirectReplySnapshot,
} = require("../services/directMessageReplyService");

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Test",
    lastName: "User",
    email: "user@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: true,
    status: "Offline",
    friends: [],
    ...overrides,
  });
};

describe("buildDirectReplySnapshot", () => {
  it("builds reply snapshot for an existing text message", async () => {
    const userA = await createUser({
      email: "reply-snapshot-a@example.com",
    });

    const userB = await createUser({
      email: "reply-snapshot-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Original message",
          created_at: new Date(),
        },
      ],
    });

    const snapshot = buildDirectReplySnapshot({
      conversation,
      replyToMessageId: conversation.messages[0]._id,
      userId: userB._id,
    });

    expect(snapshot.messageId.toString()).toBe(
      conversation.messages[0]._id.toString(),
    );
    expect(snapshot.from.toString()).toBe(userA._id.toString());
    expect(snapshot.type).toBe("Text");
    expect(snapshot.text).toBe("Original message");
    expect(snapshot.file).toBe("");
  });

  it("builds reply snapshot for a media message", async () => {
    const userA = await createUser({
      email: "reply-media-a@example.com",
    });

    const userB = await createUser({
      email: "reply-media-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Media",
          file: "http://localhost:3000/uploads/media/image.png",
          text: "Image caption",
          created_at: new Date(),
        },
      ],
    });

    const snapshot = buildDirectReplySnapshot({
      conversation,
      replyToMessageId: conversation.messages[0]._id,
      userId: userB._id,
    });

    expect(snapshot.type).toBe("Media");
    expect(snapshot.text).toBe("Image caption");
    expect(snapshot.file).toBe("http://localhost:3000/uploads/media/image.png");
  });

  it("returns null when reply message id is not provided", async () => {
    const snapshot = buildDirectReplySnapshot({
      conversation: {
        messages: [],
      },
      userId: "user-a",
    });

    expect(snapshot).toBeNull();
  });

  it("rejects invalid reply message id", async () => {
    expect(() =>
      buildDirectReplySnapshot({
        conversation: {
          messages: [],
        },
        replyToMessageId: "invalid-id",
        userId: "user-a",
      }),
    ).toThrow("Invalid reply message id");
  });

  it("rejects missing reply message", async () => {
    const userA = await createUser({
      email: "reply-missing-a@example.com",
    });

    const userB = await createUser({
      email: "reply-missing-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [],
    });

    expect(() =>
      buildDirectReplySnapshot({
        conversation,
        replyToMessageId: userB._id,
        userId: userA._id,
      }),
    ).toThrow("Reply message not found");
  });

  it("rejects reply to a message deleted for the current user", async () => {
    const userA = await createUser({
      email: "reply-deleted-a@example.com",
    });

    const userB = await createUser({
      email: "reply-deleted-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Deleted original",
          deletedFor: [userB._id],
          created_at: new Date(),
        },
      ],
    });

    expect(() =>
      buildDirectReplySnapshot({
        conversation,
        replyToMessageId: conversation.messages[0]._id,
        userId: userB._id,
      }),
    ).toThrow("Reply message not found");
  });
});
