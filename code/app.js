// Load environment
require("./config/environment.js");

// Shared
const AppError = require("shared/error");
const Logger = require("shared/logger");

// Constants
const DOMAIN = process.env.DOMAIN;
const NODE_ENV = process.env.NODE_ENV;
const ENVIRONMENT = process.env.ENVIRONMENT;
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Express and body parsers
const express = require("express");
const app = express();
var BODY_LIMIT = "3mb";
app.use(express.json({
  limit: BODY_LIMIT,
  extended: true
}));

// Main only logs errors
const expressWinston = require("express-winston");
expressWinston.requestWhitelist = ["url", "method", "httpVersion", "originalUrl"];
app.use(expressWinston.logger({
  winstonInstance: Logger,
  skip: function (request, response) {
    if (response.statusCode < 400) {
      return true;
    }
    return false;
  }
}));

// Log unhandled rejections
process.on("unhandledRejection", error => {
  Logger.error(`unhandledRejection:
    ${error.stack}`);
});

// Basic Security
app.use(require("helmet")());

// Sessions/Flash
app.use(require("./config/session.js"));
if (NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Routes
var baseURI = "/api/v1"
app.use(baseURI, require('./routes/preview-controller'));
app.use(baseURI + "/user", require('./routes/user-controller'));
app.use(baseURI + "/doc", require('./routes/doc-controller'));
app.use(baseURI + "/audit", require('./routes/audit-controller'));

// Log Errors
app.use(expressWinston.errorLogger({
  winstonInstance: Logger
}));

app.get(baseURI + "/health", (request, response, next) => {
  response.status(200).json({
    message: "OK from " + DOMAIN
  });
});

// Handle Errors
app.use((error, request, response, next) => {
  if (response.headersSent) {
    Logger.error("RESPONSE ALREADY SENT");
    return;
  }
  if (error.statusCode >= 200 && error.statusCode < 500) {
    response.status(error.statusCode).json({
      code: error.appCode,
      message: error.message
    });
  }
  else {
    response.status(500).json({
      code: -1,
      message: "Unknown Internal Error"
    });
  }
});

// Handle 404 Not Found
app.use((request, response, next) => {
  Logger.info("404 NOT FOUND - " + request.originalUrl);
  return response.status(404).json({
    code: 404,
    message: "Not Found"
  });
});

module.exports = app;
