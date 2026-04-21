const router = require("express").Router();

const authRoute = require("./auth");
const userRoute = require("./user");
const conversationRoute = require("./conversation");

router.use("/auth", authRoute);
router.use("/user", userRoute);
router.use("/conversation", conversationRoute);

module.exports = router;
