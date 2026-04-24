const request = require("supertest");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/user");

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Reset",
    lastName: "User",
    email: "reset@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: true,
    ...overrides,
  });
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

describe("POST /auth/reset-password", () => {
  it("resets password with a valid token and returns a new auth token", async () => {
    const rawResetToken = "valid-reset-token";
    const user = await createUser({
      email: "reset-success@example.com",
      passwordResetToken: hashToken(rawResetToken),
      passwordResetExpires: Date.now() + 10 * 60 * 1000,
    });

    const response = await request(app).post("/auth/reset-password").send({
      token: rawResetToken,
      password: "87654321",
      passwordConfirm: "87654321",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Password Reseted Successfully");
    expect(response.body.token).toBeDefined();
    expect(response.body.user_id).toBe(user._id.toString());

    const updatedUser = await User.findById(user._id).select(
      "+password passwordResetToken passwordResetExpires",
    );

    expect(updatedUser.passwordResetToken).toBeFalsy();
    expect(updatedUser.passwordResetExpires).toBeFalsy();

    const loginResponse = await request(app).post("/auth/login").send({
      email: "reset-success@example.com",
      password: "87654321",
    });

    expect(loginResponse.statusCode).toBe(200);
    expect(loginResponse.body.status).toBe("success");
  });

  it("rejects password reset with an invalid token", async () => {
    const response = await request(app).post("/auth/reset-password").send({
      token: "non-existent-token",
      password: "87654321",
      passwordConfirm: "87654321",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Token is Invalid or Expired");
  });

  it("rejects password reset with an expired token", async () => {
    const rawResetToken = "expired-reset-token";

    await createUser({
      email: "reset-expired@example.com",
      passwordResetToken: hashToken(rawResetToken),
      passwordResetExpires: Date.now() - 60 * 1000,
    });

    const response = await request(app).post("/auth/reset-password").send({
      token: rawResetToken,
      password: "87654321",
      passwordConfirm: "87654321",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Token is Invalid or Expired");
  });
});
