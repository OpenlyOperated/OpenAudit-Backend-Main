const AppError = require("shared/error");
const Logger = require("shared/logger");

// Middleware
const authenticate = require("../middleware/authenticate.js");
const { body } = require("express-validator");
const { ValidateCheck } = require("shared/utilities");
const { BruteForce } = require("shared/redis");

// Models
const { Audit } = require("shared/models");
const { Doc } = require("shared/models");

// Routes
const router = require("express").Router();

router.post("/list-public",
[
  body("userId")
    .exists().withMessage("Missing userId.")
    .not().isEmpty().withMessage("Missing userId.")
    .isAlphanumeric().withMessage("ID should be alphanumeric."),
  ValidateCheck
],
(request, response, next) => {
  const userId = request.values.userId;

  return Audit.listPublic(userId)
  .then(audits => {
    return response.status(200).json(audits);
  })
  .catch(error => next(error));
});

router.post("/upsert",
[
  authenticate.checkAndSetUser,
  body("docId")
    .exists().withMessage("Missing docId.")
    .not().isEmpty().withMessage("Missing docId.")
    .isAlphanumeric().withMessage("docId should be alphanumeric."),
  body("data")
    .exists().withMessage("Missing data.")
    .not().isEmpty().withMessage("Missing data.")
    .isJSON().withMessage("Data should be JSON."),
  ValidateCheck
],
(request, response, next) => {
  const docId = request.values.docId;
  const data = request.values.data;
  const auditorId = request.user.id;

  const dataJSON = JSON.parse(data);

  // validate data
  for (const key in dataJSON) {
    let item = dataJSON[key]
    // ensure has required fields
    if (!item.hasOwnProperty("description")) {
      throw new AppError(400, 1238, "Missing description.")
    }
    if (!item.hasOwnProperty("status")) {
      throw new AppError(400, 1238, "Missing status.")
    }
    if (!item.hasOwnProperty("updated")) {
      throw new AppError(400, 1238, "Missing updated.")
    }
    if (item.description.length >= 1000) {
      throw new AppError(400, 1238, "Description must be shorter than 1000 characters.")
    }
    if (item.status !== "pass" && item.status !== "fail" && item.status !== null) {
      throw new AppError(400, 1238, "Status must be pass, fail, or null.")
    }
    if (!Number.isInteger(item.updated)) {
      throw new AppError(400, 1238, "Updated must be valid epoch.")
    }
  }

  return Doc.get(docId)
  .then(doc => {
    if (doc.owner === auditorId) {
      throw new AppError(400, 181, "Can't audit your own document.")
    }
    if (doc.allowAudit === false) {
      throw new AppError(400, 182, "Auditing not currently allowed for this document.")
    }
    return Audit.upsert(docId, data, auditorId)
  })
  .then(audit => {
    return response.status(200).json(audit);
  })
  .catch(error => next(error));
});

// id == id && owner == user
// get-owned is getting ONE audit (used for /audit mode) for logged in auditor
router.post("/get",
[
  authenticate.checkAndSetUser,
  body("docId")
    .exists().withMessage("Missing docId.")
    .not().isEmpty().withMessage("Missing docId.")
    .isAlphanumeric().withMessage("docId should be alphanumeric."),
  ValidateCheck
],
(request, response, next) => {
  const docId = request.values.docId;

  return Audit.get(docId, request.user.id)
  .then(audit => {
    return response.status(200).json(audit);
  })
  .catch(error => next(error));
});

// show all the audits that logged in user is auditor of
router.post("/list",
[
  authenticate.checkAndSetUser,
  ValidateCheck
],
(request, response, next) => {

  return Audit.listNonPrivate(request.user.id)
  .then(audits => {
    return response.status(200).json(audits);
  })
  .catch(error => next(error));

});

module.exports = router;
