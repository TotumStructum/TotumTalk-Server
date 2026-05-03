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

  describe("GET /conversation/group/:groupId/messages", () => {
    it("returns group messages for a participant", async () => {
      const userA = await createUser({
        email: "group-messages-a@example.com",
        firstName: "User",
        lastName: "A",
      });

      const userB = await createUser({
        email: "group-messages-b@example.com",
        firstName: "User",
        lastName: "B",
      });

      const userC = await createUser({
        email: "group-messages-c@example.com",
        firstName: "User",
        lastName: "C",
      });

      const group = await GroupMessage.create({
        title: "Messages Group",
        creator: userA._id,
        participants: [userA._id, userB._id, userC._id],
        messages: [
          {
            from: userB._id,
            type: "Text",
            text: "Hello group",
          },
        ],
      });

      const token = signToken(userA._id);

      const response = await request(app)
        .get(`/conversation/group/${group._id}/messages`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe("success");
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].text).toBe("Hello group");
      expect(response.body.data[0].type).toBe("Text");
      expect(response.body.data[0].from._id).toBe(userB._id.toString());
      expect(response.body.data[0].from.firstName).toBe("User");
    });

    it("does not return group messages for a non-participant", async () => {
      const userA = await createUser({
        email: "private-group-a@example.com",
      });

      const userB = await createUser({
        email: "private-group-b@example.com",
      });

      const userC = await createUser({
        email: "private-group-c@example.com",
      });

      const outsider = await createUser({
        email: "private-group-outsider@example.com",
      });

      const group = await GroupMessage.create({
        title: "Private Messages Group",
        creator: userA._id,
        participants: [userA._id, userB._id, userC._id],
        messages: [
          {
            from: userA._id,
            type: "Text",
            text: "Secret message",
          },
        ],
      });

      const token = signToken(outsider._id);

      const response = await request(app)
        .get(`/conversation/group/${group._id}/messages`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.statusCode).toBe(404);
      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Group conversation not found");
    });

    it("rejects invalid group conversation id", async () => {
      const userA = await createUser({
        email: "invalid-group-id-user@example.com",
      });

      const token = signToken(userA._id);

      const response = await request(app)
        .get("/conversation/group/not-valid-id/messages")
        .set("Authorization", `Bearer ${token}`);

      expect(response.statusCode).toBe(400);
      expect(response.body.status).toBe("error");
      expect(response.body.message).toBe("Invalid group conversation id");
    });
  });
});

describe("DELETE /conversation/group/:groupId/leave", () => {
  it("removes the authenticated user from group participants without deleting messages", async () => {
    const userA = await createUser({
      email: "leave-group-a@example.com",
    });

    const userB = await createUser({
      email: "leave-group-b@example.com",
    });

    const userC = await createUser({
      email: "leave-group-c@example.com",
    });

    const group = await GroupMessage.create({
      title: "Leave Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
      messages: [
        {
          from: userB._id,
          type: "Text",
          text: "Message should stay",
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete(`/conversation/group/${group._id}/leave`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.groupId).toBe(group._id.toString());

    const savedGroup = await GroupMessage.findById(group._id);

    expect(savedGroup).not.toBeNull();

    const participantIds = savedGroup.participants.map((participantId) =>
      participantId.toString(),
    );

    expect(participantIds).not.toContain(userA._id.toString());
    expect(participantIds).toContain(userB._id.toString());
    expect(participantIds).toContain(userC._id.toString());

    expect(savedGroup.messages).toHaveLength(1);
    expect(savedGroup.messages[0].text).toBe("Message should stay");
  });

  it("does not return a group after the authenticated user leaves it", async () => {
    const userA = await createUser({
      email: "leave-list-a@example.com",
    });

    const userB = await createUser({
      email: "leave-list-b@example.com",
    });

    const userC = await createUser({
      email: "leave-list-c@example.com",
    });

    const group = await GroupMessage.create({
      title: "Hidden After Leave",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userA._id);

    await request(app)
      .delete(`/conversation/group/${group._id}/leave`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get("/conversation/group")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data).toHaveLength(0);
  });

  it("does not allow a non-participant to leave a group", async () => {
    const userA = await createUser({
      email: "leave-owner@example.com",
    });

    const userB = await createUser({
      email: "leave-member-b@example.com",
    });

    const userC = await createUser({
      email: "leave-member-c@example.com",
    });

    const outsider = await createUser({
      email: "leave-outsider@example.com",
    });

    const group = await GroupMessage.create({
      title: "Private Leave Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(outsider._id);

    const response = await request(app)
      .delete(`/conversation/group/${group._id}/leave`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Group conversation not found");
  });

  it("rejects invalid group conversation id when leaving a group", async () => {
    const userA = await createUser({
      email: "leave-invalid@example.com",
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete("/conversation/group/not-valid-id/leave")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Invalid group conversation id");
  });
});

describe("PATCH /conversation/group/:groupId/participants", () => {
  it("allows the group creator to add friend participants", async () => {
    const userA = await createUser({
      email: "add-group-owner@example.com",
      firstName: "Owner",
    });

    const userB = await createUser({
      email: "add-group-member-b@example.com",
      firstName: "Member",
      lastName: "B",
    });

    const userC = await createUser({
      email: "add-group-member-c@example.com",
      firstName: "Member",
      lastName: "C",
    });

    const userD = await createUser({
      email: "add-group-member-d@example.com",
      firstName: "Member",
      lastName: "D",
    });

    userA.friends = [userB._id, userC._id, userD._id];
    await userA.save({ validateModifiedOnly: true });

    const group = await GroupMessage.create({
      title: "Add Members Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .patch(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [userD._id.toString()],
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.participants).toHaveLength(4);

    const participantIds = response.body.data.participants.map((participant) =>
      participant._id.toString(),
    );

    expect(participantIds).toContain(userA._id.toString());
    expect(participantIds).toContain(userB._id.toString());
    expect(participantIds).toContain(userC._id.toString());
    expect(participantIds).toContain(userD._id.toString());

    const savedGroup = await GroupMessage.findById(group._id);

    expect(savedGroup.participants.map((id) => id.toString())).toContain(
      userD._id.toString(),
    );
  });

  it("does not allow a non-creator participant to add members", async () => {
    const userA = await createUser({
      email: "add-non-creator-owner@example.com",
    });

    const userB = await createUser({
      email: "add-non-creator-member@example.com",
    });

    const userC = await createUser({
      email: "add-non-creator-member-c@example.com",
    });

    const userD = await createUser({
      email: "add-non-creator-new@example.com",
    });

    const group = await GroupMessage.create({
      title: "Creator Only Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userB._id);

    const response = await request(app)
      .patch(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [userD._id.toString()],
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Only group creator can add participants",
    );
  });

  it("does not add existing group participants again", async () => {
    const userA = await createUser({
      email: "add-existing-owner@example.com",
    });

    const userB = await createUser({
      email: "add-existing-member-b@example.com",
    });

    const userC = await createUser({
      email: "add-existing-member-c@example.com",
    });

    userA.friends = [userB._id, userC._id];
    await userA.save({ validateModifiedOnly: true });

    const group = await GroupMessage.create({
      title: "No Duplicate Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .patch(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [userB._id.toString()],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "One or more users are already group participants",
    );
  });

  it("does not add users who are not friends with the creator", async () => {
    const userA = await createUser({
      email: "add-non-friend-owner@example.com",
    });

    const userB = await createUser({
      email: "add-non-friend-member-b@example.com",
    });

    const userC = await createUser({
      email: "add-non-friend-member-c@example.com",
    });

    const stranger = await createUser({
      email: "add-non-friend-stranger@example.com",
    });

    userA.friends = [userB._id, userC._id];
    await userA.save({ validateModifiedOnly: true });

    const group = await GroupMessage.create({
      title: "Friends Only Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .patch(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [stranger._id.toString()],
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("You can add only friends to groups");
  });

  it("rejects invalid group conversation id when adding participants", async () => {
    const userA = await createUser({
      email: "add-invalid-group-id@example.com",
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .patch("/conversation/group/not-valid-id/participants")
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Invalid group conversation id");
  });
});

describe("DELETE /conversation/group/:groupId/participants", () => {
  it("allows the group creator to remove participants without deleting messages", async () => {
    const userA = await createUser({
      email: "remove-group-owner@example.com",
    });

    const userB = await createUser({
      email: "remove-group-member-b@example.com",
    });

    const userC = await createUser({
      email: "remove-group-member-c@example.com",
    });

    const group = await GroupMessage.create({
      title: "Remove Members Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
      messages: [
        {
          from: userB._id,
          type: "Text",
          text: "Message should stay",
        },
      ],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [userB._id.toString()],
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data.participants).toHaveLength(2);

    const participantIds = response.body.data.participants.map((participant) =>
      participant._id.toString(),
    );

    expect(participantIds).toContain(userA._id.toString());
    expect(participantIds).toContain(userC._id.toString());
    expect(participantIds).not.toContain(userB._id.toString());

    const savedGroup = await GroupMessage.findById(group._id);

    expect(savedGroup.messages).toHaveLength(1);
    expect(savedGroup.messages[0].text).toBe("Message should stay");
  });

  it("does not allow a non-creator participant to remove members", async () => {
    const userA = await createUser({
      email: "remove-non-creator-owner@example.com",
    });

    const userB = await createUser({
      email: "remove-non-creator-member-b@example.com",
    });

    const userC = await createUser({
      email: "remove-non-creator-member-c@example.com",
    });

    const group = await GroupMessage.create({
      title: "Creator Remove Only Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userB._id);

    const response = await request(app)
      .delete(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [userC._id.toString()],
      });

    expect(response.statusCode).toBe(403);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Only group creator can remove participants",
    );
  });

  it("does not allow removing the group creator", async () => {
    const userA = await createUser({
      email: "remove-creator-owner@example.com",
    });

    const userB = await createUser({
      email: "remove-creator-member-b@example.com",
    });

    const userC = await createUser({
      email: "remove-creator-member-c@example.com",
    });

    const group = await GroupMessage.create({
      title: "Cannot Remove Creator Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [userA._id.toString()],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Use leave group to remove yourself");
  });

  it("does not remove users who are not group participants", async () => {
    const userA = await createUser({
      email: "remove-not-participant-owner@example.com",
    });

    const userB = await createUser({
      email: "remove-not-participant-member-b@example.com",
    });

    const userC = await createUser({
      email: "remove-not-participant-member-c@example.com",
    });

    const outsider = await createUser({
      email: "remove-not-participant-outsider@example.com",
    });

    const group = await GroupMessage.create({
      title: "Participants Only Remove Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [outsider._id.toString()],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "One or more users are not group participants",
    );
  });

  it("rejects invalid member id when removing participants", async () => {
    const userA = await createUser({
      email: "remove-invalid-member-owner@example.com",
    });

    const userB = await createUser({
      email: "remove-invalid-member-b@example.com",
    });

    const userC = await createUser({
      email: "remove-invalid-member-c@example.com",
    });

    const group = await GroupMessage.create({
      title: "Invalid Remove Member Group",
      creator: userA._id,
      participants: [userA._id, userB._id, userC._id],
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete(`/conversation/group/${group._id}/participants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: ["not-valid-id"],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Invalid group member id");
  });

  it("rejects invalid group conversation id when removing participants", async () => {
    const userA = await createUser({
      email: "remove-invalid-group-id@example.com",
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .delete("/conversation/group/not-valid-id/participants")
      .set("Authorization", `Bearer ${token}`)
      .send({
        members: [],
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Invalid group conversation id");
  });
});
