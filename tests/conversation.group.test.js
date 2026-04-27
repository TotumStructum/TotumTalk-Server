const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/user");
const GroupMessage = require("../models/GroupMessage");

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

const signToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

describe("POST /conversation/group", () => {
  it("creates a group conversation with the authenticated user and selected friends", async () => {
    const userA = await createUser({
      email: "group-a@example.com",
      firstName: "User",
      lastName: "A",
    });

    const userB = await createUser({
      email: "group-b@example.com",
      firstName: "User",
      lastName: "B",
    });

    const userC = await createUser({
      email: "group-c@example.com",
      firstName: "User",
      lastName: "C",
    });

    userA.friends = [userB._id, userC._id];
    await userA.save({ validateModifiedOnly: true });

    const token = signToken(userA._id);

    const response = await request(app)
      .post("/conversation/group")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Study Group",
        members: [userB._id.toString(), userC._id.toString()],
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.status).toBe("success");
    expect(response.body.data.title).toBe("Study Group");
    expect(response.body.data.participants).toHaveLength(3);

    const participantIds = response.body.data.participants.map((participant) =>
      participant._id.toString(),
    );

    expect(participantIds).toContain(userA._id.toString());
    expect(participantIds).toContain(userB._id.toString());
    expect(participantIds).toContain(userC._id.toString());

    const savedGroup = await GroupMessage.findById(response.body.data._id);
    expect(savedGroup.creator.toString()).toBe(userA._id.toString());
  });

  it("does not create a group with users who are not friends", async () => {
    const userA = await createUser({ email: "group-owner@example.com" });
    const friend = await createUser({ email: "group-friend@example.com" });
    const stranger = await createUser({ email: "group-stranger@example.com" });

    userA.friends = [friend._id];
    await userA.save({ validateModifiedOnly: true });

    const token = signToken(userA._id);

    const response = await request(app)
      .post("/conversation/group")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Private Group",
        members: [friend._id.toString(), stranger._id.toString()],
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "You can create groups only with friends",
    );
  });

  it("requires at least two selected members besides the authenticated user", async () => {
    const userA = await createUser({ email: "small-group-owner@example.com" });
    const userB = await createUser({ email: "small-group-friend@example.com" });

    userA.friends = [userB._id];
    await userA.save({ validateModifiedOnly: true });

    const token = signToken(userA._id);

    const response = await request(app)
      .post("/conversation/group")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Too Small",
        members: [userB._id.toString()],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Group must have at least 2 members besides you",
    );
  });
});

describe("GET /conversation/group", () => {
  it("returns only group conversations where the authenticated user is a participant", async () => {
    const userA = await createUser({
      email: "groups-owner@example.com",
      firstName: "Owner",
    });

    const userB = await createUser({
      email: "groups-member-b@example.com",
      firstName: "Member",
      lastName: "B",
    });

    const userC = await createUser({
      email: "groups-member-c@example.com",
      firstName: "Member",
      lastName: "C",
    });

    const outsider = await createUser({
      email: "groups-outsider@example.com",
      firstName: "Outsider",
    });

    const visibleGroup = await GroupMessage.create({
      title: "Visible Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    await GroupMessage.create({
      title: "Hidden Group",
      creator: outsider._id,
      participants: [outsider._id, userB._id, userC._id],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .get("/conversation/group")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(visibleGroup._id.toString());
    expect(response.body.data[0].title).toBe("Visible Group");

    const participantIds = response.body.data[0].participants.map(
      (participant) => participant._id.toString(),
    );

    expect(participantIds).toContain(userA._id.toString());
    expect(participantIds).toContain(userB._id.toString());
    expect(participantIds).toContain(userC._id.toString());
  });
});
