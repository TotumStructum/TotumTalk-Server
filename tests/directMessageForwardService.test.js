const User = require("../models/user");
const OneToOneMessage = require("../models/OneToOneMessage");
const {
  forwardDirectMessage,
} = require("../services/directMessageForwardService");

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

describe("forwardDirectMessage", () => {
  it("forwards a text message to another direct conversation", async () => {
    const userA = await createUser({
      email: "forward-text-a@example.com",
      socket_id: "socket-a",
    });

    const userB = await createUser({
      email: "forward-text-b@example.com",
      socket_id: "socket-b",
    });

    const userC = await createUser({
      email: "forward-text-c@example.com",
      socket_id: "socket-c",
    });

    const sourceConversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Message to forward",
          created_at: new Date(),
        },
      ],
    });

    const targetConversation = await OneToOneMessage.create({
      participants: [userA._id, userC._id],
      messages: [],
    });

    const result = await forwardDirectMessage({
      userId: userA._id,
      sourceConversationId: sourceConversation._id,
      messageId: sourceConversation.messages[0]._id,
      targetConversationId: targetConversation._id,
    });

    expect(result.message.type).toBe("Text");
    expect(result.message.text).toBe("Message to forward");
    expect(result.message.from.toString()).toBe(userA._id.toString());
    expect(result.message.to.toString()).toBe(userC._id.toString());
    expect(result.message.forwardedFrom.text).toBe("Message to forward");
    expect(result.message.forwardedFrom.messageId.toString()).toBe(
      sourceConversation.messages[0]._id.toString(),
    );
    expect(result.recipients).toHaveLength(2);

    const updatedTarget = await OneToOneMessage.findById(
      targetConversation._id,
    );

    expect(updatedTarget.messages).toHaveLength(1);
    expect(updatedTarget.messages[0].text).toBe("Message to forward");
  });

  it("forwards a media message with file and caption", async () => {
    const userA = await createUser({
      email: "forward-media-a@example.com",
    });

    const userB = await createUser({
      email: "forward-media-b@example.com",
    });

    const userC = await createUser({
      email: "forward-media-c@example.com",
    });

    const sourceConversation = await OneToOneMessage.create({
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

    const targetConversation = await OneToOneMessage.create({
      participants: [userA._id, userC._id],
      messages: [],
    });

    const result = await forwardDirectMessage({
      userId: userA._id,
      sourceConversationId: sourceConversation._id,
      messageId: sourceConversation.messages[0]._id,
      targetConversationId: targetConversation._id,
    });

    expect(result.message.type).toBe("Media");
    expect(result.message.file).toBe(
      "http://localhost:3000/uploads/media/image.png",
    );
    expect(result.message.text).toBe("Image caption");
    expect(result.message.forwardedFrom.file).toBe(
      "http://localhost:3000/uploads/media/image.png",
    );
  });

  it("does not forward a message deleted for the current user", async () => {
    const userA = await createUser({
      email: "forward-deleted-a@example.com",
    });

    const userB = await createUser({
      email: "forward-deleted-b@example.com",
    });

    const userC = await createUser({
      email: "forward-deleted-c@example.com",
    });

    const sourceConversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Deleted message",
          deletedFor: [userA._id],
          created_at: new Date(),
        },
      ],
    });

    const targetConversation = await OneToOneMessage.create({
      participants: [userA._id, userC._id],
      messages: [],
    });

    await expect(
      forwardDirectMessage({
        userId: userA._id,
        sourceConversationId: sourceConversation._id,
        messageId: sourceConversation.messages[0]._id,
        targetConversationId: targetConversation._id,
      }),
    ).rejects.toThrow("Message not found");

    const updatedTarget = await OneToOneMessage.findById(
      targetConversation._id,
    );

    expect(updatedTarget.messages).toHaveLength(0);
  });

  it("does not allow forwarding from a source conversation where user is not participant", async () => {
    const userA = await createUser({
      email: "forward-private-a@example.com",
    });

    const userB = await createUser({
      email: "forward-private-b@example.com",
    });

    const userC = await createUser({
      email: "forward-private-c@example.com",
    });

    const outsider = await createUser({
      email: "forward-private-outsider@example.com",
    });

    const sourceConversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Private source message",
          created_at: new Date(),
        },
      ],
    });

    const targetConversation = await OneToOneMessage.create({
      participants: [outsider._id, userC._id],
      messages: [],
    });

    await expect(
      forwardDirectMessage({
        userId: outsider._id,
        sourceConversationId: sourceConversation._id,
        messageId: sourceConversation.messages[0]._id,
        targetConversationId: targetConversation._id,
      }),
    ).rejects.toThrow("Source conversation not found");
  });

  it("does not allow forwarding to a target conversation where user is not participant", async () => {
    const userA = await createUser({
      email: "forward-target-private-a@example.com",
    });

    const userB = await createUser({
      email: "forward-target-private-b@example.com",
    });

    const userC = await createUser({
      email: "forward-target-private-c@example.com",
    });

    const userD = await createUser({
      email: "forward-target-private-d@example.com",
    });

    const sourceConversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Target private message",
          created_at: new Date(),
        },
      ],
    });

    const targetConversation = await OneToOneMessage.create({
      participants: [userC._id, userD._id],
      messages: [],
    });

    await expect(
      forwardDirectMessage({
        userId: userA._id,
        sourceConversationId: sourceConversation._id,
        messageId: sourceConversation.messages[0]._id,
        targetConversationId: targetConversation._id,
      }),
    ).rejects.toThrow("Target conversation not found");
  });

  it("rejects forwarding to the same conversation", async () => {
    const userA = await createUser({
      email: "forward-same-a@example.com",
    });

    const userB = await createUser({
      email: "forward-same-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Same conversation",
          created_at: new Date(),
        },
      ],
    });

    await expect(
      forwardDirectMessage({
        userId: userA._id,
        sourceConversationId: conversation._id,
        messageId: conversation.messages[0]._id,
        targetConversationId: conversation._id,
      }),
    ).rejects.toThrow("Target conversation must be different");
  });
});
