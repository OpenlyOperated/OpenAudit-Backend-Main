const AppError = require("shared/error");
const Logger = require("shared/logger");

// Constants
const DOMAIN = process.env.DOMAIN;
const NODE_ENV = process.env.NODE_ENV;
const USER_SESSION_SECRET = process.env.USER_SESSION_SECRET;

const session = require("express-session");

const RedisClient = require("shared/redis").Client;
const RedisStore = require("connect-redis")(session);

const sessionOptions = {
  store: new RedisStore({
    client: RedisClient,
    prefix: "u:" // "user session"
  }),
  secret: USER_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true
  },
  unset: "destroy",
  name: "openauditid",
  sameSite: true
};

if (NODE_ENV === "production") {
  sessionOptions.cookie.secure = true;
  sessionOptions.cookie.domain = DOMAIN;
}

module.exports = [
  session(sessionOptions)
];
