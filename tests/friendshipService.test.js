const User = require("../models/user");
const { removeFriend } = require("../services/friendshipService");

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

describe("removeFriend", () => {
  it("removes friendship from both users", async () => {
    const userA = await createUser({
      email: "remove-a@example.com",
      socket_id: "socket-a",
    });

    const userB = await createUser({
      email: "remove-b@example.com",
      socket_id: "socket-b",
    });

    userA.friends.push(userB._id);
    userB.friends.push(userA._id);

    await Promise.all([
      userA.save({ validateModifiedOnly: true }),
      userB.save({ validateModifiedOnly: true }),
    ]);

    const result = await removeFriend({
      userId: userA._id,
      friendId: userB._id,
    });

    expect(result.user.socket_id).toBe("socket-a");
    expect(result.friend.socket_id).toBe("socket-b");

    const updatedUserA = await User.findById(userA._id);
    const updatedUserB = await User.findById(userB._id);

    expect(updatedUserA.friends).toHaveLength(0);
    expect(updatedUserB.friends).toHaveLength(0);
  });

  it("removes inconsistent one-sided friendship from the existing side", async () => {
    const userA = await createUser({
      email: "remove-one-sided-a@example.com",
    });

    const userB = await createUser({
      email: "remove-one-sided-b@example.com",
    });

    userA.friends.push(userB._id);
    await userA.save({ validateModifiedOnly: true });

    await removeFriend({
      userId: userA._id,
      friendId: userB._id,
    });

    const updatedUserA = await User.findById(userA._id);
    const updatedUserB = await User.findById(userB._id);

    expect(updatedUserA.friends).toHaveLength(0);
    expect(updatedUserB.friends).toHaveLength(0);
  });

  it("rejects removing a user who is not a friend", async () => {
    const userA = await createUser({
      email: "remove-not-friends-a@example.com",
    });

    const userB = await createUser({
      email: "remove-not-friends-b@example.com",
    });

    await expect(
      removeFriend({
        userId: userA._id,
        friendId: userB._id,
      }),
    ).rejects.toThrow("Users are not friends");
  });

  it("rejects missing friend id", async () => {
    const userA = await createUser({
      email: "remove-missing-id@example.com",
    });

    await expect(
      removeFriend({
        userId: userA._id,
      }),
    ).rejects.toThrow("Friend id is required");
  });

  it("rejects invalid friend id", async () => {
    const userA = await createUser({
      email: "remove-invalid-id@example.com",
    });

    await expect(
      removeFriend({
        userId: userA._id,
        friendId: "invalid-id",
      }),
    ).rejects.toThrow("Invalid friend id");
  });

  it("rejects removing yourself", async () => {
    const userA = await createUser({
      email: "remove-self@example.com",
    });

    await expect(
      removeFriend({
        userId: userA._id,
        friendId: userA._id,
      }),
    ).rejects.toThrow("You cannot remove yourself as a friend");
  });

  it("rejects non-existing friend id", async () => {
    const userA = await createUser({
      email: "remove-not-found@example.com",
    });

    await expect(
      removeFriend({
        userId: userA._id,
        friendId: new User()._id,
      }),
    ).rejects.toThrow("User not found");
  });

  it("does not allow removing TotumAI system contact", async () => {
    const userA = await createUser({
      email: "remove-system-contact-user@example.com",
    });

    const totumAIUser = await createUser({
      email: "remove-system-contact-ai@example.com",
      firstName: "TotumAI",
      lastName: "Assistant",
      isAI: true,
      isSystem: true,
      systemKey: "TEST_TOTUM_AI_REMOVE",
    });

    userA.friends.push(totumAIUser._id);
    totumAIUser.friends.push(userA._id);

    await Promise.all([
      userA.save({ validateModifiedOnly: true }),
      totumAIUser.save({ validateModifiedOnly: true }),
    ]);

    await expect(
      removeFriend({
        userId: userA._id,
        friendId: totumAIUser._id,
      }),
    ).rejects.toThrow("System contact cannot be removed");

    const updatedUserA = await User.findById(userA._id);
    const updatedTotumAIUser = await User.findById(totumAIUser._id);

    expect(
      updatedUserA.friends.some(
        (friendId) => friendId.toString() === totumAIUser._id.toString(),
      ),
    ).toBe(true);

    expect(
      updatedTotumAIUser.friends.some(
        (friendId) => friendId.toString() === userA._id.toString(),
      ),
    ).toBe(true);
  });
});
