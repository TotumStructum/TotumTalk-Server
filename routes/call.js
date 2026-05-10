const router = require("express").Router();

const authController = require("../controllers/authController");
const callController = require("../controllers/callController");

router.use(authController.protect);

router.get("/logs", callController.getCallLogs);

module.exports = router;
