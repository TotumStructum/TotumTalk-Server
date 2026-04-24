jest.mock("../services/mailer", () => ({
  sendEmail: jest.fn(),
}));

const request = require("supertest");
const app = require("../app");
const User = require("../models/user");
const mailService = require("../services/mailer");

describe("POST /auth/register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registers a new user and sends OTP email", async () => {
    mailService.sendEmail.mockResolvedValueOnce();

    const response = await request(app).post("/auth/register").send({
      firstName: "Register",
      lastName: "User",
      email: "register@example.com",
      password: "12345678",
      passwordConfirm: "12345678",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("OTP Sent Successfully!");

    const user = await User.findOne({ email: "register@example.com" });

    expect(user).toBeTruthy();
    expect(user.firstName).toBe("Register");
    expect(user.lastName).toBe("User");
    expect(user.verified).toBe(false);
    expect(user.otp).toBeDefined();
    expect(user.otp_expiry_time).toBeDefined();

    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(mailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "register@example.com",
        subject: "Verification OTP",
      }),
    );
  });

  it("updates an existing unverified user and sends a new OTP", async () => {
    mailService.sendEmail.mockResolvedValueOnce();

    const existingUser = await User.create({
      firstName: "Old",
      lastName: "Name",
      email: "pending@example.com",
      password: "12345678",
      passwordConfirm: "12345678",
      verified: false,
    });

    const oldUpdatedAt = existingUser.updatedAt;

    const response = await request(app).post("/auth/register").send({
      firstName: "New",
      lastName: "Name",
      email: "pending@example.com",
      password: "87654321",
      passwordConfirm: "87654321",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("OTP Sent Successfully!");

    const updatedUser = await User.findOne({ email: "pending@example.com" });

    expect(updatedUser._id.toString()).toBe(existingUser._id.toString());
    expect(updatedUser.firstName).toBe("New");
    expect(updatedUser.lastName).toBe("Name");
    expect(updatedUser.verified).toBe(false);
    expect(updatedUser.otp).toBeDefined();
    expect(updatedUser.otp_expiry_time).toBeDefined();
    expect(updatedUser.updatedAt.getTime()).toBeGreaterThanOrEqual(
      oldUpdatedAt.getTime(),
    );

    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not allow register for an already verified email", async () => {
    await User.create({
      firstName: "Verified",
      lastName: "User",
      email: "verified@example.com",
      password: "12345678",
      passwordConfirm: "12345678",
      verified: true,
    });

    const response = await request(app).post("/auth/register").send({
      firstName: "Another",
      lastName: "User",
      email: "verified@example.com",
      password: "12345678",
      passwordConfirm: "12345678",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Email is already in use. Please login.",
    );

    expect(mailService.sendEmail).not.toHaveBeenCalled();
  });

  it("rolls back OTP fields when email sending fails", async () => {
    mailService.sendEmail.mockRejectedValueOnce(new Error("Mail failed"));

    const response = await request(app).post("/auth/register").send({
      firstName: "Mail",
      lastName: "Failure",
      email: "mail-failure@example.com",
      password: "12345678",
      passwordConfirm: "12345678",
    });

    expect(response.statusCode).toBe(500);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Failed to send OTP email. Please try again later.",
    );

    const user = await User.findOne({
      email: "mail-failure@example.com",
    }).select("otp otp_expiry_time verified");

    expect(user).toBeTruthy();
    expect(user.verified).toBe(false);
    expect(user.otp).toBeFalsy();
    expect(user.otp_expiry_time).toBeFalsy();

    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
  });
});
