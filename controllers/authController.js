const jwt = require("jsonwebtoken");
const User = require("../models/user");
const filterObj = require("../utils/filterObj");
const otpGenerator = require("otp-generator");
const crypto = require("crypto");
const { promisify } = require("util");
const mailService = require("../services/mailer");
const otp = require("../templates/mail/otp");
const resetPassword = require("../templates/mail/resetPassword");
const catchAsync = require("../utils/catchAsync");

const signToken = (userId) =>
  jwt.sign(
    {
      userId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

// Register new user
exports.register = catchAsync(async (req, res, next) => {
  const { firstName, lastName, email, password, passwordConfirm } = req.body;

  if (!passwordConfirm) {
    return res.status(400).json({
      status: "error",
      message: "Password confirm is required",
    });
  }

  const filteredBody = filterObj(
    req.body,
    "firstName",
    "lastName",
    "email",
    "password",
    "passwordConfirm",
  );

  // check if email exist
  const existing_user = await User.findOne({ email: email });

  if (existing_user && existing_user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already in use. Please login.",
    });
  } else if (existing_user) {
    existing_user.set(filteredBody);
    await existing_user.save({ validateModifiedOnly: true });

    req.userId = existing_user._id;
    return next();
  } else {
    //if user record is not available in DB

    const new_user = await User.create(filteredBody);

    //generate otp and send email
    req.userId = new_user._id;
    return next();
  }
});

exports.sendOTP = catchAsync(async (req, res, next) => {
  const userId = req.userId;
  const { email } = req.body;

  let user;

  if (userId) {
    user = await User.findById(userId);
  } else if (email) {
    user = await User.findOne({ email });
  } else {
    return res.status(400).json({
      status: "error",
      message: "Please provide userId (internal) or email",
    });
  }

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "User not found",
    });
  }

  if (user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already verified",
    });
  }

  const otpPlain = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });

  user.otp = otpPlain;
  user.otp_expiry_time = new Date(Date.now() + 10 * 60 * 1000);

  await user.save({ validateModifiedOnly: true });

  try {
    await mailService.sendEmail({
      from: "totumstructum@gmail.com",
      to: user.email,
      subject: "Verification OTP",
      html: otp(user.firstName, otpPlain),
      attachments: [],
    });
  } catch (error) {
    user.otp = undefined;
    user.otp_expiry_time = undefined;
    await user.save({ validateModifiedOnly: true });

    return res.status(500).json({
      status: "error",
      message: "Failed to send OTP email. Please try again later.",
    });
  }

  return res.status(200).json({
    status: "success",
    message: "OTP Sent Successfully!",
  });
});

exports.verifyOTP = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      status: "error",
      message: "Email and OTP are required",
    });
  }

  const user = await User.findOne({
    email,
    otp_expiry_time: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Email is invalid or OTP expired",
    });
  }

  if (user.verified) {
    return res.status(400).json({
      status: "error",
      message: "Email is already verified",
    });
  }

  const otpStr = String(otp);

  const isCorrect = await user.correctOTP(otpStr, user.otp);
  if (!isCorrect) {
    return res.status(400).json({
      status: "error",
      message: "OTP is incorrect",
    });
  }

  user.verified = true;
  user.otp = undefined;
  user.otp_expiry_time = undefined;

  await user.save({ validateModifiedOnly: true });

  const token = signToken(user._id);

  return res.status(200).json({
    status: "success",
    message: "OTP verified Successfully!",
    token,
    user_id: user._id,
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      status: "error",
      message: "Both email and password are required",
    });
  }

  const user = await User.findOne({ email }).select("+password");

  if (
    !user ||
    !user.password ||
    !(await user.correctPassword(password, user.password))
  ) {
    return res.status(400).json({
      status: "error",
      message: "Email or password is incorrect",
    });
  }

  if (!user.verified) {
    return res.status(403).json({
      status: "error",
      message: "Please verify your email before logging in.",
    });
  }

  const token = signToken(user._id);

  return res.status(200).json({
    status: "success",
    message: "Logged in successfully!",
    token,
    user_id: user._id,
  });
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return res.status(401).json({
      status: "error",
      message: "You are not logged in! Please log in to get access.",
    });
  }

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      status: "error",
      message: "Invalid or expired token. Please log in again.",
    });
  }

  const this_user = await User.findById(decoded.userId);
  if (!this_user) {
    return res.status(401).json({
      status: "error",
      message: "The user belonging to this token no longer exists.",
    });
  }

  if (this_user.changedPasswordAfter(decoded.iat)) {
    return res.status(401).json({
      status: "error",
      message: "User recently changed password! Please log in again.",
    });
  }

  req.user = this_user;
  return next();
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return res.status(404).json({
      status: "error",
      message: "There is no user with email address.",
    });
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  try {
    const resetURL = `http://localhost:3001/auth/new-password?token=${resetToken}`;

    await mailService.sendEmail({
      from: "totumstructum@gmail.com",
      to: user.email,
      subject: "Reset Password",
      html: resetPassword(user.firstName, resetURL),
      attachments: [],
    });

    return res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(500).json({
      message: "There was an error sending the email. Try again later!",
    });
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.body.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    return res.status(400).json({
      status: "error",
      message: "Token is Invalid or Expired",
    });
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user
  // 4) Log the user in, send JWT
  const token = signToken(user._id);

  return res.status(200).json({
    status: "success",
    message: "Password Reseted Successfully",
    token,
    user_id: user._id,
  });
});
