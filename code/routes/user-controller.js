const AppError = require("shared/error");
const Logger = require("shared/logger");

// Middleware
const authenticate = require("../middleware/authenticate.js");
const { body, oneOf } = require("express-validator");
const { ValidateCheck } = require("shared/utilities");
const { BruteForce } = require("shared/redis");
const passwordRules = require("../middleware/password-rules.js");

// Models
const { User } = require("shared/models");
const { Doc } = require("shared/models");
const { Audit } = require("shared/models");

// Constants
const MATCH_DOMAINS = require('disposable-email-domains');
const MATCH_DOMAINS_2 = ["affecting.org"];
const MATCH_WILDCARDS = require('disposable-email-domains/wildcard.json');

// Routes
const router = require("express").Router();

router.post("/get-public",
[
  body("username")
    .exists().withMessage("Missing username.")
    .not().isEmpty().withMessage("Missing username.")
    .matches(/^[a-zA-Z0-9-_]+$/).withMessage("Username can only have numbers, letters, dashes, and underlines.")
    .isLength({ min: 1, max: 39 }).withMessage("Username must be shorter than 40 characters."),
  ValidateCheck
],
(request, response, next) => {
  const username = request.values.username;
  return User.getWithUsername(
    username,
    "id, username, real_name, linkedin, github, qualifications",
    false,
    false
  )
  .then(user => {
    return response.status(200).json(user);
  })
  .catch(error => next(error));
});

router.post("/signup",
  [
    BruteForce(50),
    body("username")
      .exists().withMessage("Missing username.")
      .not().isEmpty().withMessage("Missing username.")
      .matches(/^[a-zA-Z0-9-_]+$/).withMessage("Username can only have numbers, letters, dashes, and underlines.")
      .isLength({ min: 1, max: 39 }).withMessage("Username must be shorter than 40 characters."),
    body("email")
      .exists().withMessage("Missing email address.")
      .isEmail().withMessage("Invalid email address.")
      .normalizeEmail(),
    body("password")
      .exists().withMessage("Missing password.")
      .not().isEmpty().withMessage("Missing password.")
      .custom(value => {
        passwordRules(value);
        return value;
      }),
    ValidateCheck
  ],
  (request, response, next) => {
    const username = request.values.username;
    const email = request.values.email;
    const password = request.values.password;

    let emailSplit = email.split("@", 2);
    if (emailSplit.length > 1) {
      let splitSecond = emailSplit[1].toLowerCase();
      if (MATCH_DOMAINS.includes(splitSecond) || MATCH_DOMAINS_2.includes(splitSecond)) {
        return next(new AppError(400, 397, "Disposable emails are not allowed. If you think this is an error, please contact us."));
      }
      MATCH_WILDCARDS.some(function (value) {
        if (splitSecond.endsWith("." + value) || splitSecond == value) {
          next(new AppError(400, 398, "Disposable emails are not allowed. If you think this is an error, please contact us."));
          return true;
        }
      })
    }

    return User.create(username, email, password)
    .then(user => {
      return response.status(200).json({
        code: 1,
        message: "Email Confirmation Sent"
      });
    })
    .catch(error => next(error));
  });

router.post("/confirm-email",
  [
    BruteForce(50),
    body("email")
    .exists().withMessage("Missing email.")
    .not().isEmpty().withMessage("Missing email.")
    .normalizeEmail()
    .isEmail().withMessage("Invalid email address."),
    body("code")
    .exists().withMessage("Missing confirmation code.")
    .not().isEmpty().withMessage("Missing confirmation code.")
    .isAlphanumeric().withMessage("Invalid confirmation code.")
    .trim(),
    ValidateCheck
  ],
  (request, response, next) => {
    const email = decodeURIComponent(request.values.email);
    const code = request.values.code;
    return User.confirmEmail(code, email)
      .then(success => {
        return response.status(200).json({
          code: 2,
          message: "Email Confirmed"
        });
      })
      .catch(error => next(error));
  });

router.post("/resend-confirm-code",
  [
    BruteForce(20),
    body("email")
    .exists().withMessage("Missing email address.")
    .isEmail().withMessage("Invalid email address.")
    .normalizeEmail(),
    ValidateCheck
  ],
  (request, response, next) => {
    const email = request.values.email;
    User.resendConfirmCode(email, true)
      .then(results => {
        return response.status(200).json({
          code: 3,
          message: "Email Confirmation Resent"
        });
      })
      .catch(error => next(error));
  });

router.post("/signin",
[
  BruteForce(50),
  body("email")
    .exists().withMessage("Missing email address.")
    .isEmail().withMessage("Invalid email address.")
    .normalizeEmail(),
  body("password")
    .exists().withMessage("Missing password.")
    .not().isEmpty().withMessage("Missing password."),
  ValidateCheck
],
(request, response, next) => {
  const email = request.values.email;
  const password = request.values.password;

  return User.getWithEmailAndPassword(email, password)
    .then( user => {
      if (user.emailConfirmed === true) {
        request.session.regenerate(error => {
          if (error) {
            throw new AppError(500, 99, "Couldn't regenerate session", error);
          }
          request.session.userId = user.id;
          request.session.save(error => {
            if (error) {
              throw new AppError(500, 99, "Couldn't save session", error);
            }
            return response.status(200).json({
              message: "Signed In",
              code: 0,
              username: user.username
            });
          });
        });
      }
      else {
        throw new AppError(200, 4, "Email Not Confirmed");
      }
    })
    .catch( error => { next(error); });
});

router.post("/check",
authenticate.checkAndSetUser,
(request, response, next) => {
  let user = request.user
  return response.status(200).json({
    message: "Logged In",
    username: user.username
  })
})

router.post("/get-private",
[
  authenticate.checkAndSetUser,
  ValidateCheck
],
(request, response, next) => {
  try {
    return response.status(200).json(request.user.getOwnProfile());
  }
  catch(error) {
    next(error);
  }
});


router.post("/update",
[
  authenticate.checkAndSetUser,
  body("realName")
    .isLength({ min: 0, max: 69 }).withMessage("Real name must be shorter than 70 characters."),
  oneOf([
    body("linkedin").isEmpty().withMessage("Invalid LinkedIn URL."),
    body("linkedin").isURL().withMessage("Invalid LinkedIn URL.")
  ]),
  body("linkedin")
    .isLength({ min: 0, max: 299 }).withMessage("LinkedIn URL must be shorter than 300 characters."),
  oneOf([
    body("github").isEmpty().withMessage("GitHub Handle can only have numbers, letters, dashes, and underlines."),
    body("github").matches(/^[a-zA-Z0-9-_]+$/).withMessage("GitHub Handle can only have numbers, letters, dashes, and underlines.")
  ]),
  body("github")
    .isLength({ min: 0, max: 39 }).withMessage("GitHub Handle must be shorter than 40 characters."),
  body("qualifications")
    .isLength({ min: 0, max: 4095 }).withMessage("Qualifications must be shorter than 4096 characters."),
  ValidateCheck
],
(request, response, next) => {
  const user = request.user;
  const realName = request.values.realName;
  const linkedin = request.values.linkedin;
  const github = request.values.github;
  const qualifications = request.values.qualifications;

  return user.update(
    realName,
    linkedin,
    github,
    qualifications
  )
  .then(success => {
    return response.status(200).json({
      message: "Updated successfully",
      code: 9228
    });
  })
  .catch(error => next(error));
});

router.post("/signout",
BruteForce(20),
(request, response, next) => {
  if (request.session) {
    request.session.destroy(error => {
      if (error) {
        // Deleting an invalid session is not a throwing error
        Logger.error("Couldn't delete session: " + error.stack);
      }
      return response.status(200).json({
        message: "Signed out",
        code: 5
      });
    });
  }
  else {
    return response.status(200).json({
      message: "Signed out",
      code: 5
    });
  }
});

router.post("/forgot-password",
[
  BruteForce(20),
  body("email")
    .exists().withMessage("Missing email address.")
    .isEmail().withMessage("Invalid email address.")
    .normalizeEmail(),
  ValidateCheck
],
(request, response, next) => {
  const email = request.values.email;
  User.generatePasswordReset(email, lockdown)
    .then( result => {
      return response.status(200).json({
        message: "If there is an account associated with that email, a password reset email will be sent to it.",
        code: 6
      });
    })
    .catch(error => { next(error); });
});

router.post("/reset-password",
[
  BruteForce(20),
  body("code")
    .exists().withMessage("Missing reset code.")
    .not().isEmpty().withMessage("Missing reset code.")
    .isLength({ min: 32, max: 32 }).withMessage("Invalid reset code.")
    .isAlphanumeric().withMessage("Invalid reset code.")
    .trim(),
  body("newPassword")
    .exists().withMessage("Missing new password.")
    .not().isEmpty().withMessage("Missing new password.")
    .custom(value => {
      passwordRules(value);
      return value;
    }),
  ValidateCheck
],
(request, response, next) => {
  const code = request.values.code;
  const newPassword = request.values.newPassword;
  User.resetPassword(code, newPassword)
    .then( success => {
      return response.status(200).json({
        message: "New password set successfully.",
        code: 7
      });
    })
    .catch(error => { next(error); });
});

/*********************************************
 *
 * Do Not Email
 *
 *********************************************/

router.post("/do-not-email",
  [
    BruteForce(20),
    body("email")
    .exists().withMessage("Missing email address.")
    .isEmail().withMessage("Invalid email address.")
    .normalizeEmail(),
    body("code")
    .isAlphanumeric().withMessage("Code must be alphanumeric"),
    ValidateCheck
  ],
  (request, response, next) => {
    const email = request.values.email;
    const code = request.values.code;
    User.setDoNotEmail(email, code)
      .then(result => {
        return response.status(200).json({
          message: "Success",
          code: 7833
        });
      })
      .catch(error => {
        next(error);
      });
  });

module.exports = router;
