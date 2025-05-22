const jwt = require("jsonwebtoken");
const User = require("../models/user");
const filterObj = require("../utils/filterObj");
const otpGenerator = require("otp-generator");
const { use } = require("react");
const crypto = require("crypto");
const { promisify } = require("util");

const signToken = (userId) =>
  jwt.sign(
    {
      userId,
    },
    process.env.JWT_SECRET
  );

// Register new user
exports.register = async (req, res, next) => {
  const { firstName, lastName, email, password } = req.body;

  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "password",
    "email"
  );

  // check if email exist
  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    res.status(400).json({
      status: "error",
      message: "Email is already in use. Please login.",
    });
  } else if (existing_user) {
    await User.findOneAndUpdate({ email: email }, filteredBody, {
      new: true,
      validateModifiedOnly: true,
    });

    //generate otp and send email
    req.userId = existing_user._id;
    next();
  } else {
    //if user record is not available in DB

    const new_user = await User.create(filteredBody);

    //generate otp and send email
    req.userId = new_user._id;
    next();
  }
};

exports.sendOTP = async (req, res, next) => {
  const { userId } = req;
  const new_otp = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });

  const otp_expiry_time = Date.now() + 10 * 60 * 1000; // 10 minutes after sending otp

  await User.findByIdAndUpdate(userId, {
    otp: new_otp,
    otp_expiry_time,
  });

  // TODO Send mail

  res.status(200).json({
    status: "success",
    message: "OTP Sent Succesfully!",
  });
};

exports.verifyOTP = async (req, res, next) => {
  //verify otp and update user record

  const { email, otp } = req.body;
  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: Date.now() },
  });

  if (!user) {
    res.status(400).json({
      status: "error",
      message: "Email is Invalid or OTP expired.",
    });
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
  }

  //otp is correct

  user.verified = true;
  user.otp = undefined;

  await user.save({ new: true, validateModifiedOnly: true });

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "OTP verified succesfull!",
    token,
  });
};

exports.login = async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({
      status: "error",
      message: "Both email and password are required",
    });
  }

  const userDoc = await User.findOne({ email: email }).select("+password");

  if (
    !userDoc ||
    !(await userDoc.correctPassword(password, userDoc.password))
  ) {
    res.status(400).json({
      status: "error",
      message: "Email or password is incorrect.",
    });
  }

  const token = signToken(userDoc._id);

  res.status(200).json({
    status: "success",
    message: "Logged is succesfully.",
    token,
  });
};

exports.protect = async (req, res, next) => {
  // getting token and heck if it's there

  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split("")[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  } else {
    req.status(400).json({
      status: "error",
      message: "You are not logged in! Please log in to get access",
    });

    return;
  }

  //verification of token

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //check if user still exist

  const this_user = await User.findById(decoded.userId);

  if (!this_user) {
    res.status(400).json({
      status: "error",
      message: "The user is doesn't exist",
    });
  }

  // check if user changed password after token was issued

  if (this_user.changedPasswordAfter(decoded.iat)) {
    res.status(400).json({
      status: "error",
      message: "User recently updated password! Please log in again",
    });
  }

  //
  req.user = this_user;
  next();
};

exports.forgotPassword = async (req, res, next) => {
  //get user email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    res.status(400).json({
      status: "error",
      message: "There is no user with given email!",
    });

    return;
  }

  //generate the random reset token
  const resetToken = user.createResetPasswordToken();

  const resetURL = `https://tawk.com/auth/reset-password/?code=${resetToken}`;

  try {
    // TODO => send mail

    res.status(200).json({
      status: "success",
      message: "Reset password link sent to email",
    });
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save({ validateBeforeSave: false });

    res.status(500).json({
      status: "error",
      message: "There was an error sending the email, Please try again later",
    });
  }
};

exports.resetPassword = async (req, res, next) => {
  //Get user based on token

  const hashedToken = crypto
    .createHash(256)
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // if token has expired or user is out of time window

  if (!user) {
    res.status(400).json({
      status: "error",
      message: "Token is invalid or expired",
    });

    return;
  }

  //update users password and set resetToken & expiry to undefined

  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  //login the user and send new jwt

  // TODO -> send an email to user informing about password reset

  const token = signToken(user._id);

  res.status(200).json({
    status: "success",
    message: "Password reseted succesfully.",
    token,
  });
};
