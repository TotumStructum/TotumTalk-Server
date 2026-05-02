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

  it("does not return messages for a conversation deleted by the authenticated user", async () => {
    const userA = await createUser({
      email: "deleted-messages-a@example.com",
      firstName: "Deleted",
      lastName: "A",
    });

    const userB = await createUser({
      email: "deleted-messages-b@example.com",
      firstName: "Deleted",
      lastName: "B",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      deletedBy: [userA._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Hidden message",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .get(`/conversation/${conversation._id}/messages`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Conversation not found");
  });
});

describe("PATCH /conversation/:conversationId/messages/:messageId/star", () => {
  it("stars and unstars a direct message for a conversation participant", async () => {
    const userA = await createUser({
      email: "star-message-a@example.com",
      firstName: "Star",
      lastName: "A",
    });

    const userB = await createUser({
      email: "star-message-b@example.com",
      firstName: "Star",
      lastName: "B",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Important message",
          created_at: new Date(),
        },
      ],
    });

    const messageId = conversation.messages[0]._id;
    const token = signToken(userA._id);

    const starResponse = await request(app)
      .patch(`/conversation/${conversation._id}/messages/${messageId}/star`)
      .set("Authorization", `Bearer ${token}`)
      .send({ starred: true });

    expect(starResponse.statusCode).toBe(200);
    expect(starResponse.body.status).toBe("success");
    expect(starResponse.body.message).toBe("Message starred");
    expect(starResponse.body.data.starredBy).toContain(userA._id.toString());

    const unstarResponse = await request(app)
      .patch(`/conversation/${conversation._id}/messages/${messageId}/star`)
      .set("Authorization", `Bearer ${token}`)
      .send({ starred: false });

    expect(unstarResponse.statusCode).toBe(200);
    expect(unstarResponse.body.status).toBe("success");
    expect(unstarResponse.body.message).toBe("Message unstarred");
    expect(unstarResponse.body.data.starredBy).not.toContain(
      userA._id.toString(),
    );
  });

  it("does not allow a user outside the conversation to star a message", async () => {
    const userA = await createUser({
      email: "star-private-a@example.com",
    });

    const userB = await createUser({
      email: "star-private-b@example.com",
    });

    const outsider = await createUser({
      email: "star-private-outsider@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Private starred message",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(outsider._id);

    const response = await request(app)
      .patch(
        `/conversation/${conversation._id}/messages/${conversation.messages[0]._id}/star`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ starred: true });

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Conversation not found");
  });

  it("rejects invalid starred value", async () => {
    const userA = await createUser({
      email: "star-invalid-a@example.com",
    });

    const userB = await createUser({
      email: "star-invalid-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Invalid star value",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .patch(
        `/conversation/${conversation._id}/messages/${conversation.messages[0]._id}/star`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ starred: "yes" });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Starred value must be boolean");
  });

  it("returns 404 when message does not exist", async () => {
    const userA = await createUser({
      email: "star-missing-message-a@example.com",
    });

    const userB = await createUser({
      email: "star-missing-message-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [],
    });

    const token = signToken(userA._id);
    const missingMessageId = userB._id;

    const response = await request(app)
      .patch(
        `/conversation/${conversation._id}/messages/${missingMessageId}/star`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ starred: true });

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Message not found");
  });
});

describe("DELETE /conversation/:conversationId", () => {
  it("deletes a direct conversation only for the authenticated user", async () => {
    const userA = await createUser({
      email: "delete-me-a@example.com",
    });

    const userB = await createUser({
      email: "delete-me-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Delete for me",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete(`/conversation/${conversation._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scope: "me" });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Conversation deleted for you");
    expect(response.body.data.deletedBy).toContain(userA._id.toString());

    const updatedConversation = await OneToOneMessage.findById(
      conversation._id,
    );

    expect(updatedConversation).not.toBeNull();
    expect(updatedConversation.deletedBy.map((id) => id.toString())).toContain(
      userA._id.toString(),
    );
    expect(
      updatedConversation.deletedBy.map((id) => id.toString()),
    ).not.toContain(userB._id.toString());
  });

  it("deletes a direct conversation for everyone", async () => {
    const userA = await createUser({
      email: "delete-everyone-a@example.com",
    });

    const userB = await createUser({
      email: "delete-everyone-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Delete for everyone",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete(`/conversation/${conversation._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scope: "everyone" });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Conversation deleted for everyone");
    expect(response.body.data).toBeNull();

    const deletedConversation = await OneToOneMessage.findById(
      conversation._id,
    );

    expect(deletedConversation).toBeNull();
  });

  it("does not allow a user outside the conversation to delete it", async () => {
    const userA = await createUser({
      email: "delete-private-a@example.com",
    });

    const userB = await createUser({
      email: "delete-private-b@example.com",
    });

    const outsider = await createUser({
      email: "delete-private-outsider@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Private delete",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(outsider._id);

    const response = await request(app)
      .delete(`/conversation/${conversation._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scope: "me" });

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Conversation not found");

    const existingConversation = await OneToOneMessage.findById(
      conversation._id,
    );

    expect(existingConversation).not.toBeNull();
  });

  it("rejects invalid delete scope", async () => {
    const userA = await createUser({
      email: "delete-invalid-scope-a@example.com",
    });

    const userB = await createUser({
      email: "delete-invalid-scope-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [
        {
          to: userB._id,
          from: userA._id,
          type: "Text",
          text: "Invalid scope",
          created_at: new Date(),
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete(`/conversation/${conversation._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ scope: "invalid" });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Delete scope must be either me or everyone",
    );
  });

  it("rejects invalid conversation id when deleting", async () => {
    const userA = await createUser({
      email: "delete-invalid-id@example.com",
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete("/conversation/invalid-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ scope: "me" });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Invalid conversation id");
  });
});
