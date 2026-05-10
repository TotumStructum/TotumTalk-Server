const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/user");
const OneToOneMessage = require("../models/OneToOneMessage");
const CallLog = require("../models/CallLog");
const {
  createCallLog,
  updateCallLogStatus,
} = require("../services/callLogService");

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

describe("GET /call/logs", () => {
  it("returns only call logs for authenticated user", async () => {
    const userA = await createUser({
      email: "call-user-a@example.com",
      firstName: "Call",
      lastName: "A",
    });

    const userB = await createUser({
      email: "call-user-b@example.com",
      firstName: "Call",
      lastName: "B",
    });

    const userC = await createUser({
      email: "call-user-c@example.com",
      firstName: "Call",
      lastName: "C",
    });

    const conversationAB = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [],
    });

    const conversationBC = await OneToOneMessage.create({
      participants: [userB._id, userC._id],
      messages: [],
    });

    await CallLog.create({
      call_id: "call-a-b",
      caller: userA._id,
      receiver: userB._id,
      participants: [userA._id, userB._id],
      conversation: conversationAB._id,
      call_type: "video",
      status: "completed",
      started_at: new Date(),
      answered_at: new Date(),
      ended_at: new Date(),
      duration_seconds: 12,
    });

    await CallLog.create({
      call_id: "call-b-c",
      caller: userB._id,
      receiver: userC._id,
      participants: [userB._id, userC._id],
      conversation: conversationBC._id,
      call_type: "audio",
      status: "completed",
      started_at: new Date(),
      answered_at: new Date(),
      ended_at: new Date(),
      duration_seconds: 20,
    });

    const token = signToken(userA._id);

    const response = await request(app)
      .get("/call/logs")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].call_id).toBe("call-a-b");
    expect(response.body.data[0].caller.firstName).toBe("Call");
    expect(response.body.data[0].receiver.firstName).toBe("Call");
  });

  it("creates and updates call log lifecycle", async () => {
    const userA = await createUser({
      email: "call-life-a@example.com",
    });

    const userB = await createUser({
      email: "call-life-b@example.com",
    });

    const conversation = await OneToOneMessage.create({
      participants: [userA._id, userB._id],
      messages: [],
    });

    const createdLog = await createCallLog({
      callId: "call-life-1",
      callerId: userA._id,
      receiverId: userB._id,
      conversationId: conversation._id,
      callType: "audio",
    });

    expect(createdLog.status).toBe("ringing");

    const activeLog = await updateCallLogStatus({
      callId: "call-life-1",
      status: "active",
    });

    expect(activeLog.status).toBe("active");
    expect(activeLog.answered_at).toBeTruthy();

    const completedLog = await updateCallLogStatus({
      callId: "call-life-1",
      status: "completed",
    });

    expect(completedLog.status).toBe("completed");
    expect(completedLog.ended_at).toBeTruthy();
    expect(completedLog.duration_seconds).toEqual(expect.any(Number));
  });
});
