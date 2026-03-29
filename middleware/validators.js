const { AppError } = require("../src/errors")
const { config } = require("../src/config")

const validateQuery = (req, res, next) => {
  const query = req.body.q || req.body.query

  if (!query || typeof query !== "string") {
    return next(
      AppError.badRequest("Missing or invalid 'query' in request body")
    )
  }

  if (query.length > config.validation.maxQueryLength) {
    return next(
      AppError.badRequest(
        `Query is too long. Maximum allowed length is ${config.validation.maxQueryLength} characters.`
      )
    )
  }

  req.body.query = query // Normalize to req.body.query
  next()
}

module.exports = { validateQuery }
