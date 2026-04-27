const fs = require("fs");
const path = require("path");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const User = require("../models/user");

const uploadedFiles = [];

const createUser = async (overrides = {}) => {
  return await User.create({
    firstName: "Upload",
    lastName: "User",
    email: "upload@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    verified: true,
    ...overrides,
  });
};

const signToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

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

describe("Upload endpoints", () => {
  it("uploads a document file via POST /upload/document", async () => {
    const user = await createUser({
      email: "document-upload@example.com",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .post("/upload/document")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("Test document content"), {
        filename: "test-document.txt",
        contentType: "text/plain",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Document uploaded successfully");

    expect(response.body.data.fileUrl).toContain("/uploads/documents/");
    expect(response.body.data.originalName).toBe("test-document.txt");
    expect(response.body.data.mimeType).toBe("text/plain");
    expect(response.body.data.size).toBeGreaterThan(0);

    trackUploadedFile(response.body.data.fileUrl);

    const uploadedFilePath = uploadedFiles[uploadedFiles.length - 1];
    expect(fs.existsSync(uploadedFilePath)).toBe(true);
  });

  it("uploads a media file via POST /upload/media", async () => {
    const user = await createUser({
      email: "media-upload@example.com",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .post("/upload/media")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fake image content"), {
        filename: "test-image.png",
        contentType: "image/png",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("success");
    expect(response.body.message).toBe("Media uploaded successfully");

    expect(response.body.data.fileUrl).toContain("/uploads/media/");
    expect(response.body.data.originalName).toBe("test-image.png");
    expect(response.body.data.mimeType).toBe("image/png");
    expect(response.body.data.size).toBeGreaterThan(0);

    trackUploadedFile(response.body.data.fileUrl);

    const uploadedFilePath = uploadedFiles[uploadedFiles.length - 1];
    expect(fs.existsSync(uploadedFilePath)).toBe(true);
  });

  it("rejects document upload with an unsupported file type", async () => {
    const user = await createUser({
      email: "invalid-document-upload@example.com",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .post("/upload/document")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("fake image content"), {
        filename: "image.png",
        contentType: "image/png",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Only PDF, DOC, DOCX and TXT files are allowed for document upload.",
    );
  });

  it("rejects media upload with an unsupported file type", async () => {
    const user = await createUser({
      email: "invalid-media-upload@example.com",
    });

    const token = signToken(user._id);

    const response = await request(app)
      .post("/upload/media")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("plain text content"), {
        filename: "text-file.txt",
        contentType: "text/plain",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.status).toBe("error");
    expect(response.body.message).toBe(
      "Only JPG, PNG, WEBP and GIF files are allowed for media upload.",
    );
  });

  it("does not allow upload without authentication", async () => {
    const response = await request(app)
      .post("/upload/media")
      .attach("file", Buffer.from("fake image content"), {
        filename: "test-image.png",
        contentType: "image/png",
      });

    expect(response.statusCode).toBe(401);
    expect(response.body.status).toBe("error");
  });
});
