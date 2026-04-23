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

describe("GET /conversation/:conversationId/messages", () => {
  it("returns messages for a conversation participant", async () => {
    const userA = await createUser({
      email: "messages-a@example.com",
      firstName: "User",
      lastName: "A",
    });

    const userB = await createUser({
      email: "messages-b@example.com",
      firstName: "User",
      lastName: "B",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Hello B",
          created_at: new Date(),
        },
        {
          to: userA._id,
          from: userB._id,
          type: "Text",
          text: "Hello A",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .get(`/conversation/${conversation._id}/messages`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].text).toBe("Hello B");
    expect(response.body.data[1].text).toBe("Hello A");
  });

  it("does not return messages to a user outside the conversation", async () => {
    const userA = await createUser({
      email: "outsider-a@example.com",
      firstName: "User",
      lastName: "A",
    });

    const userB = await createUser({
      email: "outsider-b@example.com",
      firstName: "User",
      lastName: "B",
    });

    const outsider = await createUser({
      email: "outsider-c@example.com",
      firstName: "User",
      lastName: "C",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Private message",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(outsider._id);

    const response = await request(app)
      .get(`/conversation/${conversation._id}/messages`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Conversation not found");
  });
});
