const AppError = require("shared/error.js");
const Logger = require("shared/logger.js");

// Middleware
const { body } = require("express-validator");
const { ValidateCheck } = require("shared/utilities");

// Utilities
var { getLinkPreview } = require('link-preview-js');
var axios = require('axios');

const MAX_CONTENT_LENGTH = 2097152 // 2 megabytes is max size we'll preview-fetch

// Routes
var router = require('express').Router();

router.post('/preview',
[
  body("url")
    .isURL({
      protocols: ['http', 'https'],
      require_tld: true,
      require_protocol: true,
      require_host: true,
      require_valid_protocol: true,
      allow_underscores: true,
      host_whitelist: false,
      host_blacklist: false,
      allow_trailing_dot: false,
      allow_protocol_relative_urls: false,
      disallow_auth: true
    }),
  ValidateCheck
],
(request, response, next) => {
  var url = request.values.url;

  // ensure size is smaller than 5MB or it's not "application" content type
  let toReturnIfHeadFails = {
    url: url,
    title: "",
    description: ""
  }
  axios({
    method: "HEAD",
    url: url,
    timeout: 5000
  })
  .then(headResponse => {
    if (headResponse.headers["content-length"] && parseInt(headResponse.headers["content-length"] > MAX_CONTENT_LENGTH)) {
      response.send(toReturnIfHeadFails)
    }
    else if (headResponse.headers["content-type"] && !headResponse.headers["content-type"].startsWith("text/html")) {
      response.send(toReturnIfHeadFails)
    }
    else {
      return getLinkPreview(url)
      .then((data) => {
        // title bug fix - sometimes it's duplicated
        if (data.title != null && data.title.length % 2 == 0) {
          let firstHalf = data.title.substring(0, data.title.length/2);
          let secondHalf = data.title.substring(data.title.length/2, data.title.length);
          if ( firstHalf == secondHalf ) {
            data.title = firstHalf
          }
        }
        response.send(data)
      })
      .catch( error => {
        response.status(400).json({
          message: error
        });
      })
    }
  })
  .catch( error => {
    response.send(toReturnIfHeadFails)
  })

});

module.exports = router;
