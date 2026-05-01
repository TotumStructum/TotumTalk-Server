const User = require("../models/user");
const FriendRequest = require("../models/friendRequest");
const { rejectFriendRequest } = require("../services/friendRequestService");

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

describe("rejectFriendRequest", () => {
  it("rejects an incoming friend request for the recipient", async () => {
    const sender = await createUser({
      email: "reject-sender@example.com",
      socket_id: "sender-socket",
    });

    const recipient = await createUser({
      email: "reject-recipient@example.com",
      socket_id: "recipient-socket",
    });

    const request = await FriendRequest.create({
      sender: sender._id,
      recipient: recipient._id,
    });

    const result = await rejectFriendRequest({
      userId: recipient._id,
      requestId: request._id,
    });

    expect(result.sender._id.toString()).toBe(sender._id.toString());
    expect(result.sender.socket_id).toBe("sender-socket");
    expect(result.recipient._id.toString()).toBe(recipient._id.toString());
    expect(result.recipient.socket_id).toBe("recipient-socket");

    const deletedRequest = await FriendRequest.findById(request._id);

    expect(deletedRequest).toBeNull();
  });

  it("does not allow a non-recipient to reject a friend request", async () => {
    const sender = await createUser({
      email: "reject-private-sender@example.com",
    });

    const recipient = await createUser({
      email: "reject-private-recipient@example.com",
    });

    const outsider = await createUser({
      email: "reject-private-outsider@example.com",
    });

    const request = await FriendRequest.create({
      sender: sender._id,
      recipient: recipient._id,
    });

    await expect(
      rejectFriendRequest({
        userId: outsider._id,
        requestId: request._id,
      }),
    ).rejects.toThrow("You are not allowed to reject this request");

    const existingRequest = await FriendRequest.findById(request._id);

    expect(existingRequest).not.toBeNull();
  });

  it("rejects missing friend request id", async () => {
    const recipient = await createUser({
      email: "reject-missing-id@example.com",
    });

    await expect(
      rejectFriendRequest({
        userId: recipient._id,
      }),
    ).rejects.toThrow("Friend request id is required");
  });

  it("rejects invalid friend request id", async () => {
    const recipient = await createUser({
      email: "reject-invalid-id@example.com",
    });

    await expect(
      rejectFriendRequest({
        userId: recipient._id,
        requestId: "invalid-id",
      }),
    ).rejects.toThrow("Invalid friend request id");
  });

  it("rejects non-existing friend request id", async () => {
    const recipient = await createUser({
      email: "reject-not-found@example.com",
    });

    await expect(
      rejectFriendRequest({
        userId: recipient._id,
        requestId: recipient._id,
      }),
    ).rejects.toThrow("Friend request not found");
  });
});
