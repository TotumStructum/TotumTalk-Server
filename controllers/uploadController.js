const fs = require("fs");
const path = require("path");
const multer = require("multer");
const catchAsync = require("../utils/catchAsync");

const DOCUMENT_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "documents");
const MEDIA_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "media");
const AVATAR_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "avatars");

fs.mkdirSync(DOCUMENT_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MEDIA_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });

const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const ALLOWED_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const buildFileName = (originalname) => {
  const ext = path.extname(originalname);
  const baseName = path
    .basename(originalname, ext)
    .replace(/[^a-zA-Z0-9-_]/g, "_");

  return `${Date.now()}-${baseName}${ext}`;
};

const createStorage = (destinationDir) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(destinationDir, { recursive: true });
      cb(null, destinationDir);
    },
    filename: (req, file, cb) => {
      cb(null, buildFileName(file.originalname));
    },
  });

const createFileFilter = (allowedMimeTypes, errorMessage) => {
  return (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      const error = new Error(errorMessage);
      error.statusCode = 400;

      return cb(error);
    }

    cb(null, true);
  };
};

const documentUpload = multer({
  storage: createStorage(DOCUMENT_UPLOAD_DIR),
  fileFilter: createFileFilter(
    ALLOWED_DOCUMENT_MIME_TYPES,
    "Only PDF, DOC, DOCX and TXT files are allowed for document upload.",
  ),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const mediaUpload = multer({
  storage: createStorage(MEDIA_UPLOAD_DIR),
  fileFilter: createFileFilter(
    ALLOWED_MEDIA_MIME_TYPES,
    "Only JPG, PNG, WEBP and GIF files are allowed for media upload.",
  ),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

const avatarUpload = multer({
  storage: createStorage(AVATAR_UPLOAD_DIR),
  fileFilter: createFileFilter(
    ALLOWED_MEDIA_MIME_TYPES,
    "Only JPG, PNG, WEBP and GIF files are allowed for avatar upload.",
  ),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const uploadDocumentMiddleware = documentUpload.single("file");
const uploadMediaMiddleware = mediaUpload.single("file");
const uploadAvatarMiddleware = avatarUpload.single("file");

const uploadDocument = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "Please upload a document file.",
    });
  }

  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/documents/${
    req.file.filename
  }`;

  return res.status(200).json({
    status: "success",
    message: "Document uploaded successfully",
    data: {
      fileUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
});

const uploadMedia = catchAsync(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status: "error",
      message: "Please upload a media file.",
    });
  }

  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/media/${
    req.file.filename
  }`;

  return res.status(200).json({
    status: "success",
    message: "Media uploaded successfully",
    data: {
      fileUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
});

module.exports = {
  uploadDocumentMiddleware,
  uploadDocument,
  uploadMediaMiddleware,
  uploadMedia,
  uploadAvatarMiddleware,
};
