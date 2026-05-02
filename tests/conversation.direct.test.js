const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/user");
const OneToOneMessage = require("../models/OneToOneMessage");

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

describe("GET /conversation/direct", () => {
  it("returns only conversations for the authenticated user", async () => {
    const userA = await createUser({
      email: "usera@example.com",
      firstName: "User",
      lastName: "A",
    });

    const userB = await createUser({
      email: "userb@example.com",
      firstName: "User",
      lastName: "B",
    });

    const userC = await createUser({
      email: "userc@example.com",
      firstName: "User",
      lastName: "C",
    });

    await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Hello B",
          created_at: new Date(),
        },
      ],
    });

    await OneToOneMessage.create({
      participants: [userB._id, userC._id],
      messages: [
        {
          to: userC._id,
          from: userB._id,
          type: "Text",
          text: "Hello C",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .get("/conversation/direct")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data).toHaveLength(1);

    expect(response.body.data[0].participants).toHaveLength(2);

    const participantIds = response.body.data[0].participants.map((p) =>
      p._id.toString(),
    );

    expect(participantIds).toContain(userA._id.toString());
    expect(participantIds).toContain(userB._id.toString());
    expect(participantIds).not.toContain(userC._id.toString());
  });

  it("does not return conversations deleted by the authenticated user", async () => {
    const userA = await createUser({
      email: "deleted-direct-a@example.com",
      firstName: "Deleted",
      lastName: "A",
    });

    const userB = await createUser({
      email: "deleted-direct-b@example.com",
      firstName: "Deleted",
      lastName: "B",
    });

    await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      deletedBy: [userA._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Hidden conversation",
          created_at: new Date(),
        },
      ],
    });

    const visibleConversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Visible conversation",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .get("/conversation/direct")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(visibleConversation._id.toString());
  });
});
