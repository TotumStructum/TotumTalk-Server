const express = require("express");

const routes = require("./routes/index");

const morgan = require("morgan"); // http logs

const rateLimit = require("express-rate-limit"); // request limiter

const helmet = require("helmet"); //xss protection

const mongosanitize = require("express-mongo-sanitize"); //sql injections protection

const bodyParser = require("body-parser");

const xss = require("xss"); // xss protection

const cors = require("cors");

const app = express();

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(mongosanitize());

// app.use(xss());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "PATCH", "POST", "DELETE", "PUT"],
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(helmet());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

const limiter = rateLimit({
  max: 3000,
  windowMs: 60 * 60 * 1000, //one hour
  message: "Too many requests from this IP, Please try again in one hour",
});

app.use("/tawk", limiter);

app.use(routes);

module.exports = app;
