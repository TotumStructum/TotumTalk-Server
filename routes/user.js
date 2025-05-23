const router = require("express").Router();
const userController = require("../controllers/user");
const authController = reguire("../controllers/auth.js");

router.patch("/update-me", authController.protect, userController.updateMe);

module.exports = router;
