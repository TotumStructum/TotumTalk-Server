const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/user");
const FriendRequest = require("../models/friendRequest");

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

const signToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

describe("User social endpoints", () => {
  it("returns only eligible users in GET /user/get-users", async () => {
    const currentUser = await createUser({
      email: "current@example.com",
      firstName: "Current",
      lastName: "User",
    });

    const friend = await createUser({
      email: "friend@example.com",
      firstName: "Friend",
      lastName: "User",
    });

    const outgoingPendingUser = await createUser({
      email: "outgoing@example.com",
      firstName: "Outgoing",
      lastName: "Pending",
    });

    const incomingPendingUser = await createUser({
      email: "incoming@example.com",
      firstName: "Incoming",
      lastName: "Pending",
    });

    const visibleUser = await createUser({
      email: "visible@example.com",
      firstName: "Visible",
      lastName: "User",
    });

    await createUser({
      email: "unverified@example.com",
      firstName: "Hidden",
      lastName: "User",
      verified: false,
    });

    currentUser.friends = [friend._id];
    await currentUser.save({ validateModifiedOnly: true });

    await FriendRequest.create({
      sender: currentUser._id,
      recipient: outgoingPendingUser._id,
    });

    await FriendRequest.create({
      sender: incomingPendingUser._id,
      recipient: currentUser._id,
    });

    const token = signToken(currentUser._id);

    const response = await request(app)
      .get("/user/get-users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Users found successfully!");

    const returnedIds = response.body.data.map((user) => user._id.toString());

    expect(returnedIds).toContain(visibleUser._id.toString());
    expect(returnedIds).not.toContain(currentUser._id.toString());
    expect(returnedIds).not.toContain(friend._id.toString());
    expect(returnedIds).not.toContain(outgoingPendingUser._id.toString());
    expect(returnedIds).not.toContain(incomingPendingUser._id.toString());
  });

  it("returns populated friends in GET /user/get-friends", async () => {
    const currentUser = await createUser({
      email: "friends-owner@example.com",
      firstName: "Friends",
      lastName: "Owner",
    });

    const friendA = await createUser({
      email: "friend-a@example.com",
      firstName: "Friend",
      lastName: "A",
      status: "Online",
      avatar: "a.png",
    });

    const friendB = await createUser({
      email: "friend-b@example.com",
      firstName: "Friend",
      lastName: "B",
      status: "Offline",
      avatar: "b.png",
    });

    currentUser.friends = [friendA._id, friendB._id];
    await currentUser.save({ validateModifiedOnly: true });

    const token = signToken(currentUser._id);

    const response = await request(app)
      .get("/user/get-friends")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Friends found successfully!");
    expect(response.body.data).toHaveLength(2);

    const returnedIds = response.body.data.map((user) => user._id.toString());

    expect(returnedIds).toContain(friendA._id.toString());
    expect(returnedIds).toContain(friendB._id.toString());

    expect(response.body.data[0]).toHaveProperty("firstName");
    expect(response.body.data[0]).toHaveProperty("lastName");
    expect(response.body.data[0]).toHaveProperty("avatar");
    expect(response.body.data[0]).toHaveProperty("status");
  });

  it("returns incoming friend requests with populated sender in GET /user/get-friend-requests", async () => {
    const currentUser = await createUser({
      email: "requests-owner@example.com",
      firstName: "Requests",
      lastName: "Owner",
    });

    const senderA = await createUser({
      email: "sender-a@example.com",
      firstName: "Sender",
      lastName: "A",
      status: "Online",
      avatar: "sender-a.png",
    });

    const senderB = await createUser({
      email: "sender-b@example.com",
      firstName: "Sender",
      lastName: "B",
      status: "Offline",
      avatar: "sender-b.png",
    });

    await FriendRequest.create({
      sender: senderA._id,
      recipient: currentUser._id,
    });

    await FriendRequest.create({
      sender: senderB._id,
      recipient: currentUser._id,
    });

    const token = signToken(currentUser._id);

    const response = await request(app)
      .get("/user/get-friend-requests")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Friends requests found successfully!");
    expect(response.body.data).toHaveLength(2);

    const senderIds = response.body.data.map((requestItem) =>
      requestItem.sender._id.toString(),
    );

    expect(senderIds).toContain(senderA._id.toString());
    expect(senderIds).toContain(senderB._id.toString());

    expect(response.body.data[0].sender).toHaveProperty("firstName");
    expect(response.body.data[0].sender).toHaveProperty("lastName");
    expect(response.body.data[0].sender).toHaveProperty("avatar");
    expect(response.body.data[0].sender).toHaveProperty("status");
  });
});
