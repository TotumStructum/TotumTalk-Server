const User = require("../models/user");
const OneToOneMessage = require("../models/OneToOneMessage");

const TOTUM_AI_SYSTEM_KEY = "TOTUM_AI";
const TOTUM_AI_EMAIL = "totumai@system.local";

exports.ensureTotumAIUser = async () => {
  let totumAIUser = await User.findOne({
    systemKey: TOTUM_AI_SYSTEM_KEY,
  });

  if (totumAIUser) {
    return totumAIUser;
  }

  totumAIUser = await User.create({
    firstName: "TotumAI",
    lastName: "Assistant",
    email: TOTUM_AI_EMAIL,
    verified: true,
    isAI: true,
    isSystem: true,
    systemKey: TOTUM_AI_SYSTEM_KEY,
    status: "Online",
    about: "Virtual AI interlocutor in TotumTalk.",
  });

  return totumAIUser;
};

exports.ensureTotumAIContactForUser = async (userId) => {
  const [user, totumAIUser] = await Promise.all([
    User.findById(userId),
    exports.ensureTotumAIUser(),
  ]);

  if (!user) {
    throw new Error("User not found");
  }

  const userHasTotumAI = user.friends.some(
    (friendId) => friendId.toString() === totumAIUser._id.toString(),
  );

  if (!userHasTotumAI) {
    user.friends.push(totumAIUser._id);
  }

  const totumAIHasUser = totumAIUser.friends.some(
    (friendId) => friendId.toString() === user._id.toString(),
  );

  if (!totumAIHasUser) {
    totumAIUser.friends.push(user._id);
  }

  await Promise.all([
    user.save({ validateModifiedOnly: true }),
    totumAIUser.save({ validateModifiedOnly: true }),
  ]);

  let conversation = await OneToOneMessage.findOne({
    participants: {
      $all: [user._id, totumAIUser._id],
    },
  });

  if (!conversation) {
    conversation = await OneToOneMessage.create({
      participants: [user._id, totumAIUser._id],
    });
  }

  return {
    user,
    totumAIUser,
    conversation,
  };
};

exports.TOTUM_AI_SYSTEM_KEY = TOTUM_AI_SYSTEM_KEY;
exports.TOTUM_AI_EMAIL = TOTUM_AI_EMAIL;
