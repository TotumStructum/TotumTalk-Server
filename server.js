const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

const app = require("./app");
const mongoose = require("mongoose");
const User = require("./models/user");
const path = require("path");
const { Server } = require("socket.io");
const http = require("http");
const FriendRequest = require("./models/friendRequest");
const OneToOneMessage = require("./models/OneToOneMessage");
const jwt = require("jsonwebtoken");
const {
  createGroupTextMessage,
  createGroupFileMessage,
} = require("./services/groupConversationService");
const {
  rejectFriendRequest,
  cancelFriendRequest,
} = require("./services/friendRequestService");
const { removeFriend } = require("./services/friendshipService");
const {
  buildDirectReplySnapshot,
} = require("./services/directMessageReplyService");
const {
  forwardDirectMessage,
} = require("./services/directMessageForwardService");
const {
  createTotumAIAutoReply,
} = require("./services/totumAIAutoReplyService");
const { ensureUsersCanDirectMessage } = require("./services/blockUserService");

const VALID_CALL_TYPES = ["audio", "video"];

const buildCallUserPayload = (user) => ({
  _id: user._id.toString(),
  firstName: user.firstName || "",
  lastName: user.lastName || "",
  email: user.email || "",
  avatar: user.avatar || "",
});

const emitCallError = (socket, message) => {
  socket.emit("call_error", {
    message,
  });
};

const getCallPeerUsers = async ({ from, to }) => {
  return Promise.all([
    User.findById(from).select(
      "_id firstName lastName email avatar socket_id isAI isSystem",
    ),
    User.findById(to).select(
      "_id firstName lastName email avatar socket_id isAI isSystem",
    ),
  ]);
};

const server = http.createServer(app);

process.on("uncaughtException", (err) => {
  console.log(err);
  process.exit(1);
});

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST"],
  },
});

const DB = process.env.DBURI.replace("<PASSWORD>", process.env.DBPASSWORD);

mongoose
  .connect(DB)
  .then((con) => {
    console.log("DB connection is succesfull");
  })
  .catch((err) => {
    console.log(err);
  });

const port = process.env.PORT || 8000;

server.listen(port, () => {
  console.log(`App running on port - ${port}`);
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication error"));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("_id");

    if (!user) {
      return next(new Error("Authentication error"));
    }

    socket.userId = user._id.toString();
    return next();
  } catch (error) {
    return next(new Error("Authentication error"));
  }
});

io.on("connection", async (socket) => {
  const user_id = socket.userId;

  const socket_id = socket.id;

  if (Boolean(user_id)) {
    await User.findByIdAndUpdate(user_id, { socket_id, status: "Online" });
  }

  //event listener

  socket.on("friend_request", async ({ to } = {}) => {
    const from = socket.userId;

    if (!to) {
      io.to(socket.id).emit("request_error", {
        message: "Recipient is required",
      });
      return;
    }

    if (to === from) {
      io.to(socket.id).emit("request_error", {
        message: "You cannot send a friend request to yourself",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(to)) {
      io.to(socket.id).emit("request_error", {
        message: "Invalid recipient id",
      });
      return;
    }

    const [to_user, from_user] = await Promise.all([
      User.findById(to).select("socket_id friends"),
      User.findById(from).select("socket_id friends"),
    ]);

    if (!to_user || !from_user) {
      io.to(socket.id).emit("request_error", {
        message: "User not found",
      });
      return;
    }

    const alreadyFriends = from_user.friends.some(
      (friendId) => friendId.toString() === to.toString(),
    );

    if (alreadyFriends) {
      io.to(socket.id).emit("request_error", {
        message: "Users are already friends",
      });
      return;
    }

    const existingRequest = await FriendRequest.findOne({
      $or: [
        { sender: from, recipient: to },
        { sender: to, recipient: from },
      ],
    });

    if (existingRequest) {
      const message =
        existingRequest.sender.toString() === to.toString()
          ? "This user has already sent you a friend request"
          : "Friend request already sent";

      io.to(socket.id).emit("request_error", { message });
      return;
    }

    await FriendRequest.create({
      sender: from,
      recipient: to,
    });

    if (to_user.socket_id) {
      io.to(to_user.socket_id).emit("new_friend_request", {
        message: "New Friend Request Received",
      });
    }

    if (from_user.socket_id) {
      io.to(from_user.socket_id).emit("request_sent", {
        message: "Request sent successfully",
      });
    }
  });

  socket.on("accept_request", async (data = {}) => {
    if (!data?.request_id) {
      io.to(socket.id).emit("request_error", {
        message: "Request id is required",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(data.request_id)) {
      io.to(socket.id).emit("request_error", {
        message: "Invalid request id",
      });
      return;
    }

    const request_doc = await FriendRequest.findById(data.request_id);

    if (!request_doc) {
      io.to(socket.id).emit("request_error", {
        message: "Friend request not found",
      });
      return;
    }

    if (request_doc.recipient.toString() !== socket.userId) {
      io.to(socket.id).emit("request_error", {
        message: "You are not allowed to accept this request",
      });
      return;
    }

    const [sender, receiver] = await Promise.all([
      User.findById(request_doc.sender),
      User.findById(request_doc.recipient),
    ]);

    if (!sender || !receiver) {
      io.to(socket.id).emit("request_error", {
        message: "User not found",
      });
      return;
    }

    const senderAlreadyHasReceiver = sender.friends.some(
      (friendId) => friendId.toString() === request_doc.recipient.toString(),
    );

    const receiverAlreadyHasSender = receiver.friends.some(
      (friendId) => friendId.toString() === request_doc.sender.toString(),
    );

    if (!senderAlreadyHasReceiver) {
      sender.friends.push(request_doc.recipient);
    }

    if (!receiverAlreadyHasSender) {
      receiver.friends.push(request_doc.sender);
    }

    await Promise.all([
      sender.save({ validateModifiedOnly: true }),
      receiver.save({ validateModifiedOnly: true }),
    ]);

    await FriendRequest.findByIdAndDelete(data.request_id);

    if (sender.socket_id) {
      io.to(sender.socket_id).emit("request_accepted", {
        message: "Friend request accepted",
      });
    }

    if (receiver.socket_id) {
      io.to(receiver.socket_id).emit("request_accepted", {
        message: "Friend request accepted",
      });
    }
  });

  socket.on("reject_request", async ({ request_id } = {}) => {
    try {
      const result = await rejectFriendRequest({
        userId: socket.userId,
        requestId: request_id,
      });

      if (result.sender?.socket_id) {
        io.to(result.sender.socket_id).emit("request_rejected", {
          message: "Friend request rejected",
        });
      }

      if (result.recipient?.socket_id) {
        io.to(result.recipient.socket_id).emit("request_rejected", {
          message: "Friend request rejected",
        });
      }
    } catch (error) {
      io.to(socket.id).emit("request_error", {
        message: error.message || "Failed to reject friend request",
      });
    }
  });

  socket.on("cancel_request", async ({ request_id } = {}) => {
    try {
      const result = await cancelFriendRequest({
        userId: socket.userId,
        requestId: request_id,
      });

      if (result.sender?.socket_id) {
        io.to(result.sender.socket_id).emit("request_cancelled", {
          message: "Friend request cancelled",
        });
      }

      if (result.recipient?.socket_id) {
        io.to(result.recipient.socket_id).emit("request_cancelled", {
          message: "Friend request cancelled",
        });
      }
    } catch (error) {
      io.to(socket.id).emit("request_error", {
        message: error.message || "Failed to cancel friend request",
      });
    }
  });

  socket.on("remove_friend", async ({ friend_id } = {}) => {
    try {
      const result = await removeFriend({
        userId: socket.userId,
        friendId: friend_id,
      });

      if (result.user?.socket_id) {
        io.to(result.user.socket_id).emit("friend_removed", {
          message: "Friend removed",
        });
      }

      if (result.friend?.socket_id) {
        io.to(result.friend.socket_id).emit("friend_removed", {
          message: "Friend removed",
        });
      }
    } catch (error) {
      io.to(socket.id).emit("request_error", {
        message: error.message || "Failed to remove friend",
      });
    }
  });

  socket.on("get_direct_conversations", async (_, callback) => {
    const existing_conversations = await OneToOneMessage.find({
      participants: socket.userId,
    }).populate(
      "participants",
      "firstName lastName _id email status avatar about",
    );

    if (typeof callback === "function") {
      callback(existing_conversations);
    }
  });

  socket.on("start_conversation", async ({ to } = {}) => {
    // data: { to, from }
    const from = socket.userId;

    if (!to || !from) {
      io.to(socket.id).emit("conversation_error", {
        message: "Both sender and recipient are required",
      });
      return;
    }

    if (to === from) {
      io.to(socket.id).emit("conversation_error", {
        message: "You cannot start a conversation with yourself",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(to)) {
      io.to(socket.id).emit("conversation_error", {
        message: "Invalid recipient id",
      });
      return;
    }

    const [from_user, to_user] = await Promise.all([
      User.findById(from).select("friends socket_id"),
      User.findById(to).select("friends socket_id"),
    ]);

    if (!from_user || !to_user) {
      io.to(socket.id).emit("conversation_error", {
        message: "User not found",
      });
      return;
    }

    const areFriends = from_user.friends.some(
      (friendId) => friendId.toString() === to.toString(),
    );

    if (!areFriends) {
      io.to(socket.id).emit("conversation_error", {
        message: "You can start conversations only with friends",
      });
      return;
    }

    const existing_conversations = await OneToOneMessage.find({
      participants: { $size: 2, $all: [to, from] },
    }).populate(
      "participants",
      "firstName lastName _id email status avatar about",
    );

    if (existing_conversations.length === 0) {
      let new_chat = await OneToOneMessage.create({
        participants: [to, from],
      });

      new_chat = await OneToOneMessage.findById(new_chat._id).populate(
        "participants",
        "firstName lastName _id email status avatar about",
      );

      socket.emit("start_chat", new_chat);

      if (to_user.socket_id) {
        io.to(to_user.socket_id).emit("start_chat", new_chat);
      }
    } else {
      socket.emit("start_chat", existing_conversations[0]);
    }
  });

  socket.on("get_messages", async (data, callback) => {
    if (!data?.conversation_id) {
      if (typeof callback === "function") {
        callback([]);
      }
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(data.conversation_id)) {
      if (typeof callback === "function") {
        callback([]);
      }
      return;
    }

    const conversation = await OneToOneMessage.findOne({
      _id: data.conversation_id,
      participants: socket.userId,
    }).select("messages");

    if (!conversation) {
      if (typeof callback === "function") {
        callback([]);
      }
      return;
    }

    if (typeof callback === "function") {
      callback(conversation.messages);
    }
  });

  socket.on(
    "text_message",
    async ({ to, message, conversation_id, type, reply_to } = {}) => {
      const from = socket.userId;

      if (!to || !from || !message || !conversation_id || !type) {
        io.to(socket.id).emit("message_error", {
          message: "Missing required message data",
        });
        return;
      }

      if (!message.trim()) {
        io.to(socket.id).emit("message_error", {
          message: "Message text cannot be empty",
        });
        return;
      }

      if (!["Text", "Link"].includes(type)) {
        io.to(socket.id).emit("message_error", {
          message: "Invalid message type for text_message",
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(to)) {
        io.to(socket.id).emit("message_error", {
          message: "Invalid recipient id",
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(conversation_id)) {
        io.to(socket.id).emit("message_error", {
          message: "Invalid conversation id",
        });
        return;
      }

      const to_user = await User.findById(to);
      const from_user = await User.findById(from);

      if (!to_user || !from_user) {
        io.to(socket.id).emit("message_error", {
          message: "User not found",
        });
        return;
      }

      try {
        await ensureUsersCanDirectMessage({
          senderId: from,
          recipientId: to,
        });
      } catch (error) {
        io.to(socket.id).emit("message_error", {
          message: error.message || "You cannot message this user",
        });
        return;
      }

      const chat = await OneToOneMessage.findOne({
        _id: conversation_id,
        participants: { $size: 2, $all: [from, to] },
      });

      if (!chat) {
        io.to(socket.id).emit("message_error", {
          message: "Conversation not found",
        });
        return;
      }

      const trimmedMessage = message.trim();

      if (!trimmedMessage) {
        io.to(socket.id).emit("message_error", {
          message: "Message text cannot be empty",
        });
        return;
      }

      let replyTo = null;

      try {
        replyTo = buildDirectReplySnapshot({
          conversation: chat,
          replyToMessageId: reply_to,
          userId: from,
        });
      } catch (error) {
        io.to(socket.id).emit("message_error", {
          message: error.message || "Failed to reply to message",
        });
        return;
      }

      const newMessage = {
        to,
        from,
        type,
        text: trimmedMessage,
      };

      if (replyTo) {
        newMessage.replyTo = replyTo;
      }

      chat.messages.push(newMessage);

      await chat.save();

      const saved_message = chat.messages[chat.messages.length - 1];

      if (to_user.socket_id) {
        io.to(to_user.socket_id).emit("new_message", {
          conversation_id,
          message: saved_message,
        });
      }

      if (from_user.socket_id) {
        io.to(from_user.socket_id).emit("new_message", {
          conversation_id,
          message: saved_message,
        });
      }

      if (to_user.isSystem && to_user.isAI) {
        try {
          const aiReply = await createTotumAIAutoReply({
            conversation: chat,
            userId: from,
            totumAIUserId: to,
            message: trimmedMessage,
          });

          if (from_user.socket_id) {
            io.to(from_user.socket_id).emit("new_message", {
              conversation_id,
              message: aiReply.message,
            });
          }
        } catch (error) {
          io.to(socket.id).emit("message_error", {
            message: "Failed to generate TotumAI reply",
          });
        }
      }
    },
  );

  socket.on(
    "group_text_message",
    async ({ group_id, message, type, reply_to } = {}) => {
      try {
        const result = await createGroupTextMessage({
          userId: socket.userId,
          groupId: group_id,
          message,
          type,
          replyToMessageId: reply_to,
        });

        result.recipients.forEach((recipient) => {
          if (!recipient.socket_id) return;

          io.to(recipient.socket_id).emit("new_group_message", {
            group_id,
            message: result.message,
          });
        });
      } catch (error) {
        io.to(socket.id).emit("message_error", {
          message: error.message || "Failed to send group message",
        });
      }
    },
  );

  socket.on(
    "group_file_message",
    async ({ group_id, file, type, text = "", reply_to } = {}) => {
      try {
        const result = await createGroupFileMessage({
          userId: socket.userId,
          groupId: group_id,
          file,
          type,
          text,
          replyToMessageId: reply_to,
        });

        result.recipients.forEach((recipient) => {
          if (!recipient.socket_id) return;

          io.to(recipient.socket_id).emit("new_group_message", {
            group_id,
            message: result.message,
          });
        });
      } catch (error) {
        io.to(socket.id).emit("message_error", {
          message: error.message || "Failed to send group file message",
        });
      }
    },
  );

  socket.on(
    "forward_message",
    async ({
      source_conversation_id,
      message_id,
      target_conversation_id,
    } = {}) => {
      try {
        const result = await forwardDirectMessage({
          userId: socket.userId,
          sourceConversationId: source_conversation_id,
          messageId: message_id,
          targetConversationId: target_conversation_id,
        });

        result.recipients.forEach((recipient) => {
          if (!recipient.socket_id) return;

          io.to(recipient.socket_id).emit("new_message", {
            conversation_id: target_conversation_id,
            message: result.message,
          });
        });
      } catch (error) {
        io.to(socket.id).emit("message_error", {
          message: error.message || "Failed to forward message",
        });
      }
    },
  );

  socket.on(
    "file_message",
    async ({ to, conversation_id, file, type, text = "", reply_to } = {}) => {
      const from = socket.userId;

      if (!to || !from || !conversation_id || !file || !type) {
        io.to(socket.id).emit("message_error", {
          message: "Missing required file message data",
        });
        return;
      }

      const allowedFileMessageTypes = ["Document", "Media"];

      if (!allowedFileMessageTypes.includes(type)) {
        io.to(socket.id).emit("message_error", {
          message:
            "Only document and media file messages are implemented right now",
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(to)) {
        io.to(socket.id).emit("message_error", {
          message: "Invalid recipient id",
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(conversation_id)) {
        io.to(socket.id).emit("message_error", {
          message: "Invalid conversation id",
        });
        return;
      }

      const fileUrl = typeof file === "string" ? file.trim() : "";
      const messageText = typeof text === "string" ? text.trim() : "";

      if (!fileUrl) {
        io.to(socket.id).emit("message_error", {
          message: "Document file url is required",
        });
        return;
      }

      const [to_user, from_user] = await Promise.all([
        User.findById(to).select("socket_id"),
        User.findById(from).select("socket_id"),
      ]);

      if (!to_user || !from_user) {
        io.to(socket.id).emit("message_error", {
          message: "User not found",
        });
        return;
      }

      try {
        await ensureUsersCanDirectMessage({
          senderId: from,
          recipientId: to,
        });
      } catch (error) {
        io.to(socket.id).emit("message_error", {
          message: error.message || "You cannot message this user",
        });
        return;
      }

      const chat = await OneToOneMessage.findOne({
        _id: conversation_id,
        participants: { $size: 2, $all: [from, to] },
      });

      if (!chat) {
        io.to(socket.id).emit("message_error", {
          message: "Conversation not found",
        });
        return;
      }

      let replyTo = null;

      try {
        replyTo = buildDirectReplySnapshot({
          conversation: chat,
          replyToMessageId: reply_to,
          userId: from,
        });
      } catch (error) {
        io.to(socket.id).emit("message_error", {
          message: error.message || "Failed to reply to message",
        });
        return;
      }

      const newMessage = {
        to,
        from,
        type,
        file: fileUrl,
      };

      if (messageText) {
        newMessage.text = messageText;
      }

      if (replyTo) {
        newMessage.replyTo = replyTo;
      }

      chat.messages.push(newMessage);

      await chat.save();

      const saved_message = chat.messages[chat.messages.length - 1];

      if (to_user.socket_id) {
        io.to(to_user.socket_id).emit("new_message", {
          conversation_id,
          message: saved_message,
        });
      }

      if (from_user.socket_id) {
        io.to(from_user.socket_id).emit("new_message", {
          conversation_id,
          message: saved_message,
        });
      }
    },
  );

  socket.on(
    "call_invite",
    async ({ to, conversation_id, call_id, call_type } = {}) => {
      const from = socket.userId;

      if (!to || !conversation_id || !call_id || !call_type) {
        emitCallError(socket, "Missing required call data");
        return;
      }

      if (!VALID_CALL_TYPES.includes(call_type)) {
        emitCallError(socket, "Invalid call type");
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(to)) {
        emitCallError(socket, "Invalid recipient id");
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(conversation_id)) {
        emitCallError(socket, "Invalid conversation id");
        return;
      }

      if (to.toString() === from.toString()) {
        emitCallError(socket, "You cannot call yourself");
        return;
      }

      const [from_user, to_user] = await getCallPeerUsers({ from, to });

      if (!from_user || !to_user) {
        emitCallError(socket, "User not found");
        return;
      }

      if (to_user.isSystem || to_user.isAI) {
        emitCallError(socket, "Calls with system users are not supported");
        return;
      }

      try {
        await ensureUsersCanDirectMessage({
          senderId: from,
          recipientId: to,
        });
      } catch (error) {
        emitCallError(socket, error.message || "You cannot call this user");
        return;
      }

      const conversation = await OneToOneMessage.findOne({
        _id: conversation_id,
        participants: { $size: 2, $all: [from, to] },
      });

      if (!conversation) {
        emitCallError(socket, "Conversation not found");
        return;
      }

      const payload = {
        call_id,
        conversation_id,
        call_type,
        from: buildCallUserPayload(from_user),
        to: buildCallUserPayload(to_user),
      };

      if (!to_user.socket_id) {
        socket.emit("call_unavailable", {
          ...payload,
          message: "User is offline",
        });
        return;
      }

      io.to(to_user.socket_id).emit("call_incoming", payload);
      socket.emit("call_ringing", payload);
    },
  );

  const relayCallEvent = async ({ eventName, socket, data = {} }) => {
    const from = socket.userId;
    const { to, call_id, conversation_id, call_type } = data;

    if (!to || !call_id || !conversation_id || !call_type) {
      emitCallError(socket, "Missing required call data");
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(to)) {
      emitCallError(socket, "Invalid recipient id");
      return;
    }

    const [from_user, to_user] = await getCallPeerUsers({ from, to });

    if (!from_user || !to_user) {
      emitCallError(socket, "User not found");
      return;
    }

    if (!to_user.socket_id) {
      socket.emit("call_unavailable", {
        call_id,
        conversation_id,
        call_type,
        from: buildCallUserPayload(from_user),
        to: buildCallUserPayload(to_user),
        message: "User is offline",
      });
      return;
    }

    io.to(to_user.socket_id).emit(eventName, {
      ...data,
      from: buildCallUserPayload(from_user),
      to: buildCallUserPayload(to_user),
    });
  };

  socket.on("call_accept", async (data = {}) => {
    await relayCallEvent({
      eventName: "call_accepted",
      socket,
      data,
    });
  });

  socket.on("call_decline", async (data = {}) => {
    await relayCallEvent({
      eventName: "call_declined",
      socket,
      data,
    });
  });

  socket.on("call_cancel", async (data = {}) => {
    await relayCallEvent({
      eventName: "call_cancelled",
      socket,
      data,
    });
  });

  socket.on("call_end", async (data = {}) => {
    await relayCallEvent({
      eventName: "call_ended",
      socket,
      data,
    });
  });

  socket.on("call_offer", async (data = {}) => {
    await relayCallEvent({
      eventName: "call_offer",
      socket,
      data,
    });
  });

  socket.on("call_answer", async (data = {}) => {
    await relayCallEvent({
      eventName: "call_answer",
      socket,
      data,
    });
  });

  socket.on("ice_candidate", async (data = {}) => {
    await relayCallEvent({
      eventName: "ice_candidate",
      socket,
      data,
    });
  });

  socket.on("end", async () => {
    if (socket.userId) {
      await User.findByIdAndUpdate(socket.userId, {
        status: "Offline",
        socket_id: null,
      });
    }

    socket.disconnect(true);
  });

  socket.on("disconnect", async () => {
    if (user_id) {
      await User.findByIdAndUpdate(user_id, {
        status: "Offline",
        socket_id: null,
      });
    }

    console.log(`Socket disconnected: ${socket.id}`);
  });
});

process.on("unhandledRejection", (err) => {
  console.log(err);
  server.close(() => {
    process.exit(1);
  });
});
