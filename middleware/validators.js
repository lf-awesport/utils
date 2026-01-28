const { AppError } = require("../src/errors")

const config = {
  maxQueryLength: 1000
}

const validateQuery = (req, res, next) => {
  const query = req.body.q || req.body.query

  if (!query || typeof query !== "string") {
    return next(
      AppError.badRequest("Missing or invalid 'query' in request body")
    )
  }

  if (query.length > config.maxQueryLength) {
    return next(
      AppError.badRequest(
        `Query is too long. Maximum allowed length is ${config.maxQueryLength} characters.`
      )
    )
  }

  next()
}

module.exports = { validateQuery, config }
