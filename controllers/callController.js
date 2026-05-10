const catchAsync = require("../utils/catchAsync");
const { getCallLogsForUser } = require("../services/callLogService");

exports.getCallLogs = catchAsync(async (req, res, next) => {
  const data = await getCallLogsForUser({
    userId: req.user._id,
  });

  return res.status(200).json({
    status: "success",
    data,
  });
});
