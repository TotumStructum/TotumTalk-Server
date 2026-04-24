const request = require("supertest");
const app = require("../app");
const User = require("../models/user");

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
