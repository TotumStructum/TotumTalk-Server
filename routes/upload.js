const router = require("express").Router();

const authController = require("../controllers/authController");
const uploadController = require("../controllers/uploadController");

router.use(authController.protect);

router.post(
  "/document",
  uploadController.uploadDocumentMiddleware,
  uploadController.uploadDocument,
);

router.post(
  "/media",
  uploadController.uploadMediaMiddleware,
  uploadController.uploadMedia,
);

module.exports = router;
