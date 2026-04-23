const request = require("supertest");
const app = require("../app");
const User = require("../models/user");

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Test",
    lastName: "User",
    email: "user@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: false,
    ...overrides,
  });
};

describe("POST /auth/login", () => {
  it("blocks login for an unverified user", async () => {
    await createUser({
      email: "unverified@example.com",
      verified: false,
    });

    const response = await request(app).post("/auth/login").send({
      email: "unverified@example.com",
      password: "12345678",
    });

    expect(response.statusCode).toBe(403);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Please verify your email before logging in.",
    );
  });

  it("allows login for a verified user with correct password", async () => {
    const user = await createUser({
      email: "verified@example.com",
      verified: true,
    });

    const response = await request(app).post("/auth/login").send({
      email: "verified@example.com",
      password: "12345678",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Logged in successfully!");
    expect(response.body.token).toBeDefined();
    expect(response.body.user_id).toBe(user._id.toString());
  });

  it("rejects login with a wrong password", async () => {
    await createUser({
      email: "wrong-password@example.com",
      verified: true,
    });

    const response = await request(app).post("/auth/login").send({
      email: "wrong-password@example.com",
      password: "wrongpass",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Email or password is incorrect");
  });
});
