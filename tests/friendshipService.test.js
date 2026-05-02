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
});
