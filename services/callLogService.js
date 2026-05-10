const CallLog = require("../models/CallLog");

const populateCallLogQuery = (query) =>
  query
    .populate("caller", "_id firstName lastName email avatar status")
    .populate("receiver", "_id firstName lastName email avatar status")
    .populate("conversation", "_id");

const formatCallLog = (log) => {
  if (!log) return null;

  return {
    _id: log._id.toString(),
    call_id: log.call_id,
    caller: log.caller,
    receiver: log.receiver,
    conversation:
      typeof log.conversation === "object"
        ? log.conversation._id.toString()
        : log.conversation.toString(),
    call_type: log.call_type,
    status: log.status,
    started_at: log.started_at,
    answered_at: log.answered_at || null,
    ended_at: log.ended_at || null,
    duration_seconds: log.duration_seconds || 0,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
  };
};

const getCallLogPayload = async (logId) => {
  const log = await populateCallLogQuery(CallLog.findById(logId));

  return formatCallLog(log);
};

const createCallLog = async ({
  callId,
  callerId,
  receiverId,
  conversationId,
  callType,
}) => {
  const existingLog = await populateCallLogQuery(
    CallLog.findOne({ call_id: callId }),
  );

  if (existingLog) {
    return formatCallLog(existingLog);
  }

  const log = await CallLog.create({
    call_id: callId,
    caller: callerId,
    receiver: receiverId,
    participants: [callerId, receiverId],
    conversation: conversationId,
    call_type: callType,
    status: "ringing",
    started_at: new Date(),
  });

  return await getCallLogPayload(log._id);
};

const updateCallLogStatus = async ({ callId, status }) => {
  const log = await CallLog.findOne({ call_id: callId });

  if (!log) {
    return null;
  }

  const now = new Date();

  if (status === "active") {
    log.status = "active";
    log.answered_at = log.answered_at || now;
  } else {
    const nextStatus =
      status === "completed" && !log.answered_at ? "cancelled" : status;

    log.status = nextStatus;
    log.ended_at = log.ended_at || now;

    if (nextStatus === "completed" && log.answered_at) {
      log.duration_seconds = Math.max(
        0,
        Math.floor((log.ended_at.getTime() - log.answered_at.getTime()) / 1000),
      );
    } else {
      log.duration_seconds = 0;
    }
  }

  await log.save({ validateModifiedOnly: true });

  return await getCallLogPayload(log._id);
};

const getCallLogsForUser = async ({ userId, limit = 100 }) => {
  const logs = await populateCallLogQuery(
    CallLog.find({
      participants: userId,
    })
      .sort({ createdAt: -1 })
      .limit(limit),
  );

  return logs.map(formatCallLog);
};

module.exports = {
  createCallLog,
  updateCallLogStatus,
  getCallLogsForUser,
  formatCallLog,
};
