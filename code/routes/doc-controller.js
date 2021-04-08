const AppError = require("shared/error");
const Logger = require("shared/logger");

// Middleware
const authenticate = require("../middleware/authenticate.js");
const { body, oneOf } = require("express-validator");
const { ValidateCheck } = require("shared/utilities");
const { BruteForce } = require("shared/redis");

// Models
const { User } = require("shared/models");
const { Doc } = require("shared/models");

// Routes
const router = require("express").Router();

/*
 * PUBLIC ROUTES - NO LOGIN REQUIRED
 */

router.post("/get-public",
[
  body("id")
    .exists().withMessage("Missing id.")
    .not().isEmpty().withMessage("Missing id.")
    .isAlphanumeric().withMessage("ID should be alphanumeric."),
  ValidateCheck
],
(request, response, next) => {
  const id = request.values.id;

  return Doc.get(id)
  .then(doc => {
    return response.status(200).json(doc);
  })
  .catch(error => next(error));
});

router.post("/get-with-alias-public",
[
  body("alias")
    .exists().withMessage("Missing alias.")
    .not().isEmpty().withMessage("Missing alias.")
    .customSanitizer(value => {
      return value.toLowerCase()
    }),
  ValidateCheck
],
(request, response, next) => {
  const alias = request.values.alias;

  return Doc.getWithAlias(alias)
  .then(doc => {
    return response.status(200).json(doc);
  })
  .catch(error => next(error));
});

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

  return Doc.listPublic(userId)
  .then(docs => {
    return response.status(200).json(docs);
  })
  .catch(error => next(error));
});

router.post("/list-featured",
(request, response, next) => {
  return Doc.listFeatured()
  .then(docs => {
    return response.status(200).json(docs);
  })
  .catch(error => next(error));
});


// list audits for a public document
// this is ALL audits on this public document
router.post("/audit/list",
[
  body("docId")
    .exists().withMessage("Missing docId.")
    .not().isEmpty().withMessage("Missing docId.")
    .isAlphanumeric().withMessage("docId should be alphanumeric."),
  ValidateCheck
],
(request, response, next) => {
  const docId = request.values.docId;

  return Doc.get(docId)
  .then(doc => {
    if (doc.visibility === "private") {
      throw new AppError(400, 181, "Can't request audits for a private document")
    }
    return Doc.getAudits(docId)
  })
  .then(results => {
    let audits = mergeAudits(results)
    return response.status(200).json(audits);
  })
  .catch(error => next(error));
});

/*
 * AUTHENTICATED ROUTES - LOGIN REQUIRED
 */

router.post("/new",
[
  authenticate.checkAndSetUser,
  body("content")
    .exists().withMessage("Missing content.")
    .not().isEmpty().withMessage("Missing content.")
    .isJSON().withMessage("Content should be JSON."),
  ValidateCheck
],
(request, response, next) => {
  const content = request.values.content;

  return Doc.create(content, request.user.id)
  .then(doc => {
    return response.status(200).json(doc);
  })
  .catch(error => next(error));
});

router.post("/alias/update",
[
  authenticate.checkAndSetUser,
  body("id")
    .exists().withMessage("Missing id.")
    .not().isEmpty().withMessage("Missing id.")
    .isAlphanumeric().withMessage("ID should be alphanumeric."),
  body("alias")
    .exists().withMessage("Missing alias.")
    .not().isEmpty().withMessage("Missing alias.")
    .isLength({ min: 3, max: 99 }).withMessage("Alias must be between 2 and 100 characters long.")
    .customSanitizer(value => {
      return value.toLowerCase()
    })
    .custom((value, { req }) => {
      if (/^[a-z0-9-.]+$/.test(value) === false) {
        throw new Error("Alias can only have alphanumeric, dash, and dot characters.");
      }
      if (/^(?!.*?[.-]{2})/.test(value) === false) {
        throw new Error("Alias can't have consecutive dots or dashes.");
      }
      if (value.startsWith(".") || value.startsWith("-") || value.endsWith(".") || value.endsWith("-")) {
        throw new Error("Alias can't start or end with dot or dash.")
      }
      return true;
    }),
  ValidateCheck
],
(request, response, next) => {
  const id = request.values.id;
  const alias = request.values.alias;

  return Doc.setAlias(id, alias, request.user.id)
  .then(doc => {
    return response.status(200).json(doc);
  })
  .catch(error => next(error));
})

router.post("/alias/clear",
[
  authenticate.checkAndSetUser,
  body("id")
    .exists().withMessage("Missing id.")
    .not().isEmpty().withMessage("Missing id.")
    .isAlphanumeric().withMessage("ID should be alphanumeric."),
  ValidateCheck
],
(request, response, next) => {
  const id = request.values.id;

  return Doc.setAlias(id, null, request.user.id)
  .then(doc => {
    return response.status(200).json(doc);
  })
  .catch(error => next(error));
})

router.post("/update",
[
  authenticate.checkAndSetUser,
  body("id")
    .exists().withMessage("Missing id.")
    .not().isEmpty().withMessage("Missing id.")
    .isAlphanumeric().withMessage("ID should be alphanumeric."),
  body("title"),
  body("content")
    .exists().withMessage("Missing content.")
    .not().isEmpty().withMessage("Missing content.")
    .isJSON().withMessage("Content should be JSON."),
  body("visibility")
    .exists().withMessage("Missing visibility.")
    .not().isEmpty().withMessage("Missing visibility.")
    .isIn(['public', 'private', 'unlisted']).withMessage("visibility should be 'public', 'private', or 'unlisted'"),
  body("allowAudit")
    .exists().withMessage("Missing allowAudit.")
    .not().isEmpty().withMessage("Missing allowAudit.")
    .isBoolean().withMessage("allowAudit should be Boolean."),
  ValidateCheck
],
(request, response, next) => {
  const id = request.values.id;
  const title = request.values.title;
  const content = request.values.content;
  const visibility = request.values.visibility;
  const allowAudit = request.values.allowAudit;

  if (visibility === "private" && allowAudit === true) {
    throw new AppError(400, 993, "Cannot set allowAudit to true if document visibility is private.")
  }

  return Doc.update(id, title, content, request.user.id, visibility, allowAudit)
  .then(doc => {
    return response.status(200).json(doc);
  })
  .catch(error => next(error));
});

// id == id && owner == user
router.post("/get-owned",
[
  authenticate.checkAndSetUser,
  body("id")
    .exists().withMessage("Missing id.")
    .not().isEmpty().withMessage("Missing id.")
    .isAlphanumeric().withMessage("ID should be alphanumeric."),
  ValidateCheck
],
(request, response, next) => {
  const id = request.values.id;

  return Doc.get(id, request.user.id)
  .then(doc => {
    return response.status(200).json(doc);
  })
  .catch(error => next(error));
});

// owner == user
router.post("/list-owned",
  authenticate.checkAndSetUser,
(request, response, next) => {
  return Doc.listOwned(request.user.id)
  .then(docs => {
    return response.status(200).json(docs);
  })
  .catch(error => next(error));
});

// list audits for a private document (owner previewing their own document)
// this is ALL audits on this public document
router.post("/audit/list-private",
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

  return Doc.get(docId, request.user.id)
  .then(doc => {
    return Doc.getAudits(docId)
  })
  .then(results => {
    let audits = mergeAudits(results)
    return response.status(200).json(audits);
  })
  .catch(error => next(error));
});

router.post("/delete",
[
  authenticate.checkAndSetUser,
  body("id")
    .exists().withMessage("Missing id.")
    .not().isEmpty().withMessage("Missing id.")
    .isAlphanumeric().withMessage("ID should be alphanumeric."),
  ValidateCheck
],
(request, response, next) => {
  const id = request.values.id;

  return Doc.delete(id, request.user.id)
  .then(doc => {
    return response.status(200).json(doc);
  })
  .catch(error => next(error));
});

function mergeAudits(results) {
  // merge audits, split into pass and fail
  var audits = {};
  for (const audit of results) {
    let content = JSON.parse(audit.data)
    for (const citationItemId in content) {
      if (!audits[citationItemId]) {
        audits[citationItemId] = {
          pass: [],
          fail: []
        }
      }
      let newAuditItem = {
        username: audit.usersUsername,
        description: content[citationItemId].description,
        updated: content[citationItemId].updated
      }
      let auditStatus = content[citationItemId].status
      if (auditStatus === "pass") {
        audits[citationItemId].pass.push(newAuditItem)
      }
      else if (auditStatus === "fail") {
        audits[citationItemId].fail.push(newAuditItem)
      }
    }
  }
  return audits
}

module.exports = router;
