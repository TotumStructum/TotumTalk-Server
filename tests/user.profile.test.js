const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/user");
const fs = require("fs");
const path = require("path");

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Test",
    lastName: "User",
    email: "user@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: true,
    status: "Offline",
    ...overrides,
  });
};

const signToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const uploadedFiles = [];

const trackUploadedFile = (fileUrl) => {
  const pathname = new URL(fileUrl).pathname.replace(/^\/+/, "");
  const filePath = path.join(__dirname, "..", decodeURIComponent(pathname));

  uploadedFiles.push(filePath);
};

afterAll(() => {
  uploadedFiles.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
});

describe("User profile endpoints", () => {
  it("returns the authenticated user via GET /user/me", async () => {
    const user = await createUser({
      email: "me@example.com",
      firstName: "Profile",
      lastName: "Owner",
      about: "About me",
      avatar: "avatar.png",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .get("/user/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.data._id.toString()).toBe(user._id.toString());
    expect(response.body.data.firstName).toBe("Profile");
    expect(response.body.data.lastName).toBe("Owner");
    expect(response.body.data.email).toBe("me@example.com");
    expect(response.body.data.about).toBe("About me");
    expect(response.body.data.avatar).toBe("avatar.png");
  });

  it("updates only allowed fields via PATCH /user/update-me", async () => {
    const user = await createUser({
      email: "update@example.com",
      firstName: "Old",
      lastName: "Name",
      about: "Old about",
      avatar: "old-avatar.png",
      status: "Offline",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .patch("/user/update-me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        firstName: "New",
        lastName: "Surname",
        about: "New about",
        avatar: "new-avatar.png",
        email: "hacker@example.com",
        status: "Online",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Profile updated successfully");

    expect(response.body.data.firstName).toBe("New");
    expect(response.body.data.lastName).toBe("Surname");
    expect(response.body.data.about).toBe("New about");
    expect(response.body.data.avatar).toBe("old-avatar.png");

    expect(response.body.data.email).toBe("update@example.com");
    expect(response.body.data.status).toBe("Offline");

    const updatedUser = await User.findById(user._id).select(
      "firstName lastName about avatar email status",
    );

    expect(updatedUser.firstName).toBe("New");
    expect(updatedUser.lastName).toBe("Surname");
    expect(updatedUser.about).toBe("New about");
    expect(updatedUser.avatar).toBe("old-avatar.png");

    expect(updatedUser.email).toBe("update@example.com");
    expect(updatedUser.status).toBe("Offline");
  });

  it("uploads and stores profile avatar via PATCH /user/avatar", async () => {
    const user = await createUser({
      email: "avatar-upload@example.com",
      avatar: "",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .patch("/user/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fake avatar image"), {
        filename: "avatar.png",
        contentType: "image/png",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Avatar updated successfully");
    expect(response.body.data.avatar).toContain("/uploads/avatars/");
    expect(response.body.data.file.originalName).toBe("avatar.png");
    expect(response.body.data.file.mimeType).toBe("image/png");

    trackUploadedFile(response.body.data.avatar);

    const uploadedFilePath = uploadedFiles[uploadedFiles.length - 1];
    expect(fs.existsSync(uploadedFilePath)).toBe(true);

    const updatedUser = await User.findById(user._id).select("avatar");

    expect(updatedUser.avatar).toBe(response.body.data.avatar);
  });

  it("removes profile avatar via DELETE /user/avatar", async () => {
    const user = await createUser({
      email: "avatar-remove@example.com",
      avatar: "http://127.0.0.1/uploads/avatars/old-avatar.png",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .delete("/user/avatar")
      .set("Authorization", `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Avatar removed successfully");
    expect(response.body.data.avatar).toBe("");

    const updatedUser = await User.findById(user._id).select("avatar");

    expect(updatedUser.avatar).toBe("");
  });

  it("rejects unsupported profile avatar upload", async () => {
    const user = await createUser({
      email: "avatar-invalid@example.com",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .patch("/user/avatar")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("plain text"), {
        filename: "avatar.txt",
        contentType: "text/plain",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Only JPG, PNG, WEBP and GIF files are allowed for avatar upload.",
    );
  });

  it("rejects password updates via PATCH /user/update-me", async () => {
    const user = await createUser({
      email: "password-update@example.com",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .patch("/user/update-me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        password: "newpassword123",
        passwordConfirm: "newpassword123",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "This route is not for password updates. Please use the appropriate endpoint.",
    );
  });
});
