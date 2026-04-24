jest.mock("../services/mailer", () => ({
  sendEmail: jest.fn(),
}));

const request = require("supertest");
const crypto = require("crypto");
const app = require("../app");
const User = require("../models/user");
const mailService = require("../services/mailer");

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Forgot",
    lastName: "User",
    email: "forgot@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: true,
    ...overrides,
  });
};

describe("POST /auth/forgot-password", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates reset token fields and sends reset email for an existing user", async () => {
    await createUser({
      email: "forgot-success@example.com",
      firstName: "Forgot",
    });

    mailService.sendEmail.mockResolvedValueOnce();

    const response = await request(app).post("/auth/forgot-password").send({
      email: "forgot-success@example.com",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Token sent to email!");

    const updatedUser = await User.findOne({
      email: "forgot-success@example.com",
    }).select("passwordResetToken passwordResetExpires firstName");

    expect(updatedUser).toBeTruthy();
    expect(updatedUser.passwordResetToken).toBeTruthy();
    expect(updatedUser.passwordResetExpires).toBeTruthy();
    expect(
      new Date(updatedUser.passwordResetExpires).getTime(),
    ).toBeGreaterThan(Date.now());

    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
    expect(mailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "forgot-success@example.com",
        subject: "Reset Password",
      }),
    );
  });

  it("returns 404 when the email does not belong to any user", async () => {
    const response = await request(app).post("/auth/forgot-password").send({
      email: "missing@example.com",
    });

    expect(response.statusCode).toBe(404);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe("There is no user with email address.");

    expect(mailService.sendEmail).not.toHaveBeenCalled();
  });

  it("clears reset token fields when sending reset email fails", async () => {
    await createUser({
      email: "forgot-failure@example.com",
    });

    mailService.sendEmail.mockRejectedValueOnce(new Error("Mail failed"));

    const response = await request(app).post("/auth/forgot-password").send({
      email: "forgot-failure@example.com",
    });

    expect(response.statusCode).toBe(500);
    expect(response.body.message).toBe(
      "There was an error sending the email. Try again later!",
    );

    const updatedUser = await User.findOne({
      email: "forgot-failure@example.com",
    }).select("passwordResetToken passwordResetExpires");

    expect(updatedUser).toBeTruthy();
    expect(updatedUser.passwordResetToken).toBeFalsy();
    expect(updatedUser.passwordResetExpires).toBeFalsy();

    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
  });
});
