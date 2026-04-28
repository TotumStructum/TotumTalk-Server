const User = require("../models/user");
const GroupMessage = require("../models/GroupMessage");
const {
  createGroupTextMessage,
} = require("../services/groupConversationService");

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

describe("createGroupTextMessage", () => {
  it("creates a text message in a group conversation for a participant", async () => {
    const userA = await createUser({
      email: "group-message-a@example.com",
      socket_id: "socket-a",
    });

    const userB = await createUser({
      email: "group-message-b@example.com",
      socket_id: "socket-b",
    });

    const userC = await createUser({
      email: "group-message-c@example.com",
      socket_id: "socket-c",
    });

    const group = await GroupMessage.create({
      title: "Study Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const result = await createGroupTextMessage({
      userId: userB._id,
      groupId: group._id,
      message: "  Hello group  ",
      type: "Text",
    });

    expect(result.message.text).toBe("Hello group");
    expect(result.message.type).toBe("Text");
    expect(result.message.from.toString()).toBe(userB._id.toString());
    expect(result.recipients).toHaveLength(3);

    const updatedGroup = await GroupMessage.findById(group._id);

    expect(updatedGroup.messages).toHaveLength(1);
    expect(updatedGroup.messages[0].text).toBe("Hello group");
    expect(updatedGroup.messages[0].from.toString()).toBe(userB._id.toString());
  });

  it("creates a link message in a group conversation for a participant", async () => {
    const userA = await createUser({
      email: "group-link-a@example.com",
    });

    const userB = await createUser({
      email: "group-link-b@example.com",
    });

    const userC = await createUser({
      email: "group-link-c@example.com",
    });

    const group = await GroupMessage.create({
      title: "Links Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const result = await createGroupTextMessage({
      userId: userA._id,
      groupId: group._id,
      message: "youtube.com",
      type: "Link",
    });

    expect(result.message.text).toBe("youtube.com");
    expect(result.message.type).toBe("Link");

    const updatedGroup = await GroupMessage.findById(group._id);

    expect(updatedGroup.messages).toHaveLength(1);
    expect(updatedGroup.messages[0].type).toBe("Link");
  });

  it("does not create a group message for a non-participant", async () => {
    const userA = await createUser({
      email: "private-message-a@example.com",
    });

    const userB = await createUser({
      email: "private-message-b@example.com",
    });

    const userC = await createUser({
      email: "private-message-c@example.com",
    });

    const outsider = await createUser({
      email: "private-message-outsider@example.com",
    });

    const group = await GroupMessage.create({
      title: "Private Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    await expect(
      createGroupTextMessage({
        userId: outsider._id,
        groupId: group._id,
        message: "I should not send this",
        type: "Text",
      }),
    ).rejects.toThrow("Group conversation not found");

    const updatedGroup = await GroupMessage.findById(group._id);

    expect(updatedGroup.messages).toHaveLength(0);
  });

  it("rejects empty group messages", async () => {
    const userA = await createUser({
      email: "empty-message-a@example.com",
    });

    const userB = await createUser({
      email: "empty-message-b@example.com",
    });

    const userC = await createUser({
      email: "empty-message-c@example.com",
    });

    const group = await GroupMessage.create({
      title: "Empty Message Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    await expect(
      createGroupTextMessage({
        userId: userA._id,
        groupId: group._id,
        message: "   ",
        type: "Text",
      }),
    ).rejects.toThrow("Message text cannot be empty");
  });
});
