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
    async ({ to, message, conversation_id, type } = {}) => {
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

      chat.messages.push({
        to,
        from,
        type,
        text: trimmedMessage,
      });

      await chat.save();

      const saved_message = chat.messages[chat.messages.length - 1];

      io.to(to_user.socket_id).emit("new_message", {
        conversation_id,
        message: saved_message,
      });

      io.to(from_user.socket_id).emit("new_message", {
        conversation_id,
        message: saved_message,
      });
    },
  );

  socket.on("file_message", async (data) => {
    io.to(socket.id).emit("message_error", {
      message: "File messages are not implemented yet",
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
