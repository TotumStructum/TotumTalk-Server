jest.mock("../services/mailer", () => ({
  sendEmail: jest.fn(),
}));

const request = require("supertest");
const app = require("../app");
const User = require("../models/user");
const mailService = require("../services/mailer");

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Otp",
    lastName: "User",
    email: "otp@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: false,
    ...overrides,
  });
};

describe("POST /auth/send-otp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends otp to an existing unverified user by email", async () => {
    await createUser({
      email: "send-otp-success@example.com",
      firstName: "Send",
    });

    mailService.sendEmail.mockResolvedValueOnce();

    const response = await request(app).post("/auth/send-otp").send({
      email: "send-otp-success@example.com",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("OTP Sent Successfully!");

    const user = await User.findOne({
      email: "send-otp-success@example.com",
    });

    expect(user).toBeTruthy();
    expect(user.otp).toBeTruthy();
    expect(user.otp_expiry_time).toBeTruthy();

    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(mailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "send-otp-success@example.com",
        subject: "Verification OTP",
      }),
    );
  });

  it("returns 404 when sending otp to a missing user", async () => {
    const response = await request(app).post("/auth/send-otp").send({
      email: "missing-otp@example.com",
    });

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("User not found");

    expect(mailService.sendEmail).not.toHaveBeenCalled();
  });

  it("returns 400 for an already verified user", async () => {
    await createUser({
      email: "verified-otp@example.com",
      verified: true,
    });

    const response = await request(app).post("/auth/send-otp").send({
      email: "verified-otp@example.com",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("Email is already verified");

    expect(mailService.sendEmail).not.toHaveBeenCalled();
  });

  it("rolls back otp fields if email sending fails", async () => {
    await createUser({
      email: "otp-failure@example.com",
    });

    mailService.sendEmail.mockRejectedValueOnce(new Error("Mail failed"));

    const response = await request(app).post("/auth/send-otp").send({
      email: "otp-failure@example.com",
    });

    expect(response.statusCode).toBe(500);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Failed to send OTP email. Please try again later.",
    );

    const user = await User.findOne({
      email: "otp-failure@example.com",
    });

    expect(user).toBeTruthy();
    expect(user.otp).toBeFalsy();
    expect(user.otp_expiry_time).toBeFalsy();

    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when neither email nor internal userId is provided", async () => {
    const response = await request(app).post("/auth/send-otp").send({});

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Please provide userId (internal) or email",
    );

    expect(mailService.sendEmail).not.toHaveBeenCalled();
  });
});
