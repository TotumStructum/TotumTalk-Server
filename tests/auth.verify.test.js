const request = require("supertest");
const app = require("../app");
const User = require("../models/user");
const OneToOneMessage = require("../models/OneToOneMessage");
const {
  TOTUM_AI_SYSTEM_KEY,
  ensureTotumAIContactForUser,
} = require("../services/totumAIService");

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Verify",
    lastName: "User",
    email: "verify@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: false,
    otp: "123456",
    otp_expiry_time: Date.now() + 10 * 60 * 1000,
    ...overrides,
  });
};

describe("POST /auth/verify", () => {
  it("verifies a user with correct email and otp", async () => {
    const user = await createUser({
      email: "verify-success@example.com",
      otp: "654321",
    });

    const response = await request(app).post("/auth/verify").send({
      email: "verify-success@example.com",
      otp: "654321",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("OTP verified Successfully!");
    expect(response.body.token).toBeDefined();
    expect(response.body.user_id).toBe(user._id.toString());

    const updatedUser = await User.findOne({
      email: "verify-success@example.com",
    });

    expect(updatedUser.verified).toBe(true);
    expect(updatedUser.otp).toBeFalsy();
    expect(updatedUser.otp_expiry_time).toBeFalsy();

    const verifiedUser = await User.findById(user._id).populate("friends");

    const totumAIUser = await User.findOne({
      systemKey: TOTUM_AI_SYSTEM_KEY,
    });

    expect(totumAIUser).toBeDefined();
    expect(totumAIUser.firstName).toBe("TotumAI");
    expect(totumAIUser.verified).toBe(true);
    expect(totumAIUser.isAI).toBe(true);
    expect(totumAIUser.isSystem).toBe(true);
    expect(totumAIUser.password).toBeUndefined();

    expect(
      verifiedUser.friends.some(
        (friend) => friend._id.toString() === totumAIUser._id.toString(),
      ),
    ).toBe(true);

    const conversation = await OneToOneMessage.findOne({
      participants: {
        $all: [verifiedUser._id, totumAIUser._id],
      },
    });

    expect(conversation).toBeDefined();
  });

  it("does not duplicate TotumAI contact or conversation when ensuring it multiple times", async () => {
    const user = await createUser({
      email: "verify-ai-idempotent@example.com",
      otp: "123123",
    });

    await request(app).post("/auth/verify").send({
      email: "verify-ai-idempotent@example.com",
      otp: "123123",
    });

    await ensureTotumAIContactForUser(user._id);
    await ensureTotumAIContactForUser(user._id);

    const totumAIUser = await User.findOne({
      systemKey: TOTUM_AI_SYSTEM_KEY,
    });

    const updatedUser = await User.findById(user._id);

    const aiFriendCount = updatedUser.friends.filter(
      (friendId) => friendId.toString() === totumAIUser._id.toString(),
    ).length;

    expect(aiFriendCount).toBe(1);

    const conversations = await OneToOneMessage.find({
      participants: {
        $all: [updatedUser._id, totumAIUser._id],
      },
    });

    expect(conversations).toHaveLength(1);
  });

  it("creates TotumAI system user without password", async () => {
    const user = await createUser({
      email: "verify-ai-passwordless@example.com",
      otp: "456456",
    });

    await request(app).post("/auth/verify").send({
      email: "verify-ai-passwordless@example.com",
      otp: "456456",
    });

    const totumAIUser = await User.findOne({
      systemKey: TOTUM_AI_SYSTEM_KEY,
    }).select("+password");

    expect(totumAIUser).toBeDefined();
    expect(totumAIUser.isSystem).toBe(true);
    expect(totumAIUser.isAI).toBe(true);
    expect(totumAIUser.password).toBeUndefined();

    const verifiedUser = await User.findById(user._id);

    expect(
      verifiedUser.friends.some(
        (friendId) => friendId.toString() === totumAIUser._id.toString(),
      ),
    ).toBe(true);
  });

  it("rejects verification with incorrect otp", async () => {
    await createUser({
      email: "verify-fail@example.com",
      otp: "111111",
    });

    const response = await request(app).post("/auth/verify").send({
      email: "verify-fail@example.com",
      otp: "222222",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("OTP is incorrect");
  });

  it("rejects verification when otp is expired", async () => {
    await createUser({
      email: "verify-expired@example.com",
      otp: "333333",
      otp_expiry_time: Date.now() - 60 * 1000,
    });

    const response = await request(app).post("/auth/verify").send({
      email: "verify-expired@example.com",
      otp: "333333",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Email is invalid or OTP expired");
  });
});
