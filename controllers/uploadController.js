const fs = require("fs");
const path = require("path");
const multer = require("multer");
const catchAsync = require("../utils/catchAsync");

const DOCUMENT_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "documents");

fs.mkdirSync(DOCUMENT_UPLOAD_DIR, { recursive: true });

const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DOCUMENT_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const baseName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_]/g, "_");

    cb(null, `${Date.now()}-${baseName}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error(
        "Only PDF, DOC, DOCX and TXT files are allowed for document upload.",
      ),
    );
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const uploadDocumentMiddleware = upload.single("file");

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

module.exports = {
  uploadDocumentMiddleware,
  uploadDocument,
};
