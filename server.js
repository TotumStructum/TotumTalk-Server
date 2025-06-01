const app = require("./app");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const User = require("./models/user");

dotenv.config({ path: "./config.env" });

const { Server } = require("socket.io");

process.on("uncaughtException", (err) => {
  console.log(err);
  process.exit(1);
});

const http = require("http");
const FriendRequest = require("./models/friendRequest");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
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

io.on("connection", async (socket) => {
  console.log(socket);

  const user_id = socket.handshake.query["user_id"];

  const socket_id = socket.id;

  console.log(`User connected ${socket_id}`);

  if (user_id) {
    await User.findByIdAndUpdate(user_id, { socket_id });
  }

  //event listener

  socket.on("friend_request", async (data) => {
    console.log(data.to);

    //data = {to, from}

    const to_user = await User.findById(data.to).select("socket_id");
    const from_user = await User.findById(data.to).select("socket_id");

    //create a friend request

    await FriendRequest.create({
      sender: data.from,
      recipient: data.to,
    });

    // TODO - create a friend request

    io.to(to_user.socket_id).emit("new_friend_request", {
      message: "New Friend Request Received",
    });
    io.to(from_user.socket_id).emit("request_sent", {
      message: "Request sent successfully",
    });
  });

  socket.on("accept_request", async (data) => {
    console.log(data);

    const request_doc = await FriendRequest.findById(data.request_id);
    console.log(request_doc);

    const sender = await User.findById(request_doc.sender);

    const receiver = await User.findById(request_doc.recipient);

    sender.friends.push(request_doc.recipient);
    receiver.friends.push(request_doc.sender);

    await receiver.save({ new: true, validateModifiedOnly: true });
    await sender.save({ new: true, validateModifiedOnly: true });

    await FriendRequest.findByIdAndDelete(data.request_id);

    io.to(sender.socket_id).emit("request_accepted", {
      message: "Friend request accepter",
    });
    io.to(receiver.socket_id).emit("request_accepted", {
      message: "Friend request accepter",
    });
  });

  socket.on("end", function () {
    console.log("Closing connection");
    socket.disconnect(0);
  });
});

process.on("unhandledRejection", (err) => {
  console.log(err);
  server.close(() => {
    process.exit(1);
  });
});
