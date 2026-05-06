const User = require("../models/user");
const {
  blockUser,
  unblockUser,
  ensureUsersCanDirectMessage,
} = require("../services/blockUserService");

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Test",
    lastName: "User",
    email: `user-${Date.now()}-${Math.random()}@example.com`,
    password: "12345678",
    passwordConfirm: "12345678",
    verified: true,
    status: "Offline",
    friends: [],
    blockedUsers: [],
    ...overrides,
  });
};

describe("blockUserService", () => {
  it("blocks a user and removes friendship from both sides", async () => {
    const userA = await createUser({ email: "block-a@example.com" });
    const userB = await createUser({ email: "block-b@example.com" });

    userA.friends.push(userB._id);
    userB.friends.push(userA._id);

    await Promise.all([
      userA.save({ validateModifiedOnly: true }),
      userB.save({ validateModifiedOnly: true }),
    ]);

    await blockUser({
      userId: userA._id,
      targetUserId: userB._id,
    });

    const updatedUserA = await User.findById(userA._id);
    const updatedUserB = await User.findById(userB._id);

    expect(
      updatedUserA.blockedUsers.some(
        (blockedUserId) => blockedUserId.toString() === userB._id.toString(),
      ),
    ).toBe(true);

    expect(updatedUserA.friends).toHaveLength(0);
    expect(updatedUserB.friends).toHaveLength(0);
  });

  it("does not duplicate blocked users", async () => {
    const userA = await createUser({ email: "block-duplicate-a@example.com" });
    const userB = await createUser({ email: "block-duplicate-b@example.com" });

    await blockUser({
      userId: userA._id,
      targetUserId: userB._id,
    });

    await blockUser({
      userId: userA._id,
      targetUserId: userB._id,
    });

    const updatedUserA = await User.findById(userA._id);

    expect(
      updatedUserA.blockedUsers.filter(
        (blockedUserId) => blockedUserId.toString() === userB._id.toString(),
      ),
    ).toHaveLength(1);
  });

  it("unblocks a previously blocked user", async () => {
    const userA = await createUser({ email: "unblock-a@example.com" });
    const userB = await createUser({ email: "unblock-b@example.com" });

    userA.blockedUsers.push(userB._id);
    await userA.save({ validateModifiedOnly: true });

    await unblockUser({
      userId: userA._id,
      targetUserId: userB._id,
    });

    const updatedUserA = await User.findById(userA._id);

    expect(updatedUserA.blockedUsers).toHaveLength(0);
  });

  it("rejects blocking yourself", async () => {
    const userA = await createUser({ email: "block-self@example.com" });

    await expect(
      blockUser({
        userId: userA._id,
        targetUserId: userA._id,
      }),
    ).rejects.toThrow("You cannot block yourself");
  });

  it("rejects blocking a system contact", async () => {
    const userA = await createUser({ email: "block-system-user@example.com" });
    const systemUser = await createUser({
      email: "block-system-contact@example.com",
      isAI: true,
      isSystem: true,
      systemKey: "TEST_BLOCK_SYSTEM",
    });

    await expect(
      blockUser({
        userId: userA._id,
        targetUserId: systemUser._id,
      }),
    ).rejects.toThrow("System contact cannot be blocked");
  });

  it("rejects direct messages when sender blocked recipient", async () => {
    const userA = await createUser({ email: "sender-blocked-a@example.com" });
    const userB = await createUser({ email: "sender-blocked-b@example.com" });

    userA.blockedUsers.push(userB._id);
    await userA.save({ validateModifiedOnly: true });

    await expect(
      ensureUsersCanDirectMessage({
        senderId: userA._id,
        recipientId: userB._id,
      }),
    ).rejects.toThrow("You blocked this user");
  });

  it("rejects direct messages when recipient blocked sender", async () => {
    const userA = await createUser({
      email: "recipient-blocked-a@example.com",
    });
    const userB = await createUser({
      email: "recipient-blocked-b@example.com",
    });

    userB.blockedUsers.push(userA._id);
    await userB.save({ validateModifiedOnly: true });

    await expect(
      ensureUsersCanDirectMessage({
        senderId: userA._id,
        recipientId: userB._id,
      }),
    ).rejects.toThrow("You cannot message this user");
  });

  it("allows direct messages when users did not block each other", async () => {
    const userA = await createUser({ email: "not-blocked-a@example.com" });
    const userB = await createUser({ email: "not-blocked-b@example.com" });

    await expect(
      ensureUsersCanDirectMessage({
        senderId: userA._id,
        recipientId: userB._id,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        sender: expect.any(Object),
        recipient: expect.any(Object),
      }),
    );
  });
});
