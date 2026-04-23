const request = require("supertest");
const app = require("../app");
const User = require("../models/user");

describe("POST /auth/login", () => {
  it("blocks login for an unverified user", async () => {
    await User.create({
      firstName: "Test",
      lastName: "User",
      email: "unverified@example.com",
      password: "12345678",
      passwordConfirm: "12345678",
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
});
