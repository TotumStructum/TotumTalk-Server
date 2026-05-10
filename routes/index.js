const router = require("express").Router();
const callRoute = require("./call");

const authRoute = require("./auth");
const userRoute = require("./user");
const conversationRoute = require("./conversation");
const uploadRoute = require("./upload");

router.use("/auth", authRoute);
router.use("/user", userRoute);
router.use("/conversation", conversationRoute);
router.use("/upload", uploadRoute);
router.use("/call", callRoute);

module.exports = router;
