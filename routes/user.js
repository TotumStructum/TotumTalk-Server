const router = require("express").Router();

const userController = require("../controllers/userController");
const authController = require("../controllers/authController");

router.patch("/update-me", authController.protect, userController.updateMe);

router.post("/get-users", authController.protect, userController.getUser);

module.exports = router;
